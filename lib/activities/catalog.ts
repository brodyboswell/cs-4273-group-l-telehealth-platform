import { createActivityRegistry } from "./registry";
import { feelingsActivity } from "./feelings";

// Activity definitions are added here so the route resolves only registered tools.
export const activityRegistry = createActivityRegistry([feelingsActivity]);
