import type {
  ActivityAction,
  ActivitySnapshot,
  ActivityTurnEvent,
  ActivityTool,
  RegisteredActivity,
} from "./types";

export interface ResolvedActivity {
  activityId: string;
  label: string;
  state: unknown;
  description: string;
  tools: readonly ActivityTool[];
  requiredToolName?: string;
}

export function buildActivityContext(activity: ResolvedActivity): string {
  return [
    "Current on-screen activity:",
    activity.description,
    "Use this activity state as context for the conversation. Describe only what is in the validated state.",
  ].join("\n");
}

export function buildAvailabilityMessage(activity: ResolvedActivity): string {
  return `I can interact with the ${activity.label} while we talk.`;
}

export interface ActivityRegistry {
  resolve(snapshot: unknown): ResolvedActivity;
  validateAction(
    activityId: string,
    toolName: string,
    input: unknown,
    state?: unknown,
  ): ActivityAction;
  validateTurnEvent(
    activityId: string,
    requestId: string,
    event: unknown,
    state: unknown,
  ): ActivityTurnEvent;
}

export class ActivityRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivityRegistryError";
  }
}

export function createActivityRegistry(
  definitions: readonly RegisteredActivity[],
): ActivityRegistry {
  const byId = new Map<string, RegisteredActivity>();

  for (const definition of definitions) {
    if (!definition.id.trim())
      throw new ActivityRegistryError("Activity IDs cannot be empty.");
    if (!definition.label.trim())
      throw new ActivityRegistryError(
        `Activity "${definition.id}" must have a visible label.`,
      );
    if (byId.has(definition.id))
      throw new ActivityRegistryError(
        `Activity "${definition.id}" is registered more than once.`,
      );

    const toolNames = new Set<string>();
    for (const tool of definition.tools) {
      if (!tool.name.trim() || !tool.description.trim())
        throw new ActivityRegistryError(
          `Activity "${definition.id}" has a tool without a name or description.`,
        );
      if (toolNames.has(tool.name))
        throw new ActivityRegistryError(
          `Tool "${tool.name}" is registered more than once for activity "${definition.id}".`,
        );
      toolNames.add(tool.name);
    }

    byId.set(definition.id, definition);
  }

  return {
    resolve(snapshot: unknown): ResolvedActivity {
      if (!isActivitySnapshot(snapshot))
        throw new ActivityRegistryError("Activity context is invalid.");

      const definition = byId.get(snapshot.activityId);
      if (!definition)
        throw new ActivityRegistryError(
          `Activity "${snapshot.activityId}" is not registered.`,
        );

      try {
        const state = definition.parseState(snapshot.state);
        const description = definition.describeState(state);
        if (typeof description !== "string" || !description.trim())
          throw new Error("Activity description must be a non-empty string.");

        const tools = definition.getTools?.(state) ?? definition.tools;
        assertValidTools(definition.id, tools);
        const requiredToolName = definition.requiredToolName?.(state);
        if (
          requiredToolName &&
          !tools.some((tool) => tool.name === requiredToolName)
        )
          throw new Error(
            `Required tool "${requiredToolName}" is not available in this state.`,
          );

        return {
          activityId: definition.id,
          label: definition.label,
          state,
          description,
          tools,
          requiredToolName,
        };
      } catch (error) {
        const detail =
          error instanceof Error ? ` ${error.message}` : "";
        throw new ActivityRegistryError(
          `Activity "${definition.id}" state is invalid.${detail}`,
        );
      }
    },

    validateAction(
      activityId: string,
      toolName: string,
      input: unknown,
      state?: unknown,
    ) {
      const definition = byId.get(activityId);
      if (!definition)
        throw new ActivityRegistryError(
          `Activity "${activityId}" is not registered.`,
        );

      let tool: ActivityTool | undefined;
      try {
        const tools =
          definition.getTools && state !== undefined
            ? definition.getTools(state)
            : definition.tools;
        tool = tools.find(({ name }) => name === toolName);
      } catch (error) {
        const detail = error instanceof Error ? ` ${error.message}` : "";
        throw new ActivityRegistryError(
          `Activity "${activityId}" state is invalid.${detail}`,
        );
      }
      if (!tool)
        throw new ActivityRegistryError(
          `Tool "${toolName}" is not registered for activity "${activityId}".`,
        );

      try {
        const parsedInput = tool.parseInput(input, state);
        if (!isRecord(parsedInput))
          throw new Error("Tool input must be a JSON object.");
        return {
          activityId,
          tool: toolName,
          input: parsedInput,
        };
      } catch (error) {
        const detail = error instanceof Error ? ` ${error.message}` : "";
        throw new ActivityRegistryError(
          `Input for tool "${toolName}" is invalid.${detail}`,
        );
      }
    },

    validateTurnEvent(activityId, requestId, event, state) {
      const definition = byId.get(activityId);
      if (!definition)
        throw new ActivityRegistryError(
          `Activity "${activityId}" is not registered.`,
        );
      if (!definition.parseTurnEvent)
        throw new ActivityRegistryError(
          `Activity "${activityId}" does not support client turn requests.`,
        );
      try {
        const parsed = definition.parseTurnEvent(event, requestId, state);
        if (
          parsed.activityId !== activityId ||
          parsed.requestId !== requestId ||
          !parsed.type.trim() ||
          !parsed.text.trim() ||
          !isRecord(parsed.input)
        )
          throw new Error("Activity turn event is incomplete.");
        return parsed;
      } catch (error) {
        const detail = error instanceof Error ? ` ${error.message}` : "";
        throw new ActivityRegistryError(
          `Activity "${activityId}" turn event is invalid.${detail}`,
        );
      }
    },
  };
}

function assertValidTools(activityId: string, tools: readonly ActivityTool[]) {
  const names = new Set<string>();
  for (const tool of tools) {
    if (!tool.name.trim() || !tool.description.trim())
      throw new ActivityRegistryError(
        `Activity "${activityId}" has a tool without a name or description.`,
      );
    if (names.has(tool.name))
      throw new ActivityRegistryError(
        `Tool "${tool.name}" is registered more than once for activity "${activityId}".`,
      );
    names.add(tool.name);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isActivitySnapshot(value: unknown): value is ActivitySnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "activityId" in value &&
    typeof value.activityId === "string" &&
    value.activityId.trim().length > 0 &&
    "state" in value
  );
}
