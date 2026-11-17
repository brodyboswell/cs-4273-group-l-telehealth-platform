import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  CLIENT_AGES,
  CLIENT_AVATAR_LABELS,
  CLIENT_AVATARS,
  CLIENT_GENDERS,
  MAX_CLIENT_NAME_LENGTH,
  MAX_CLIENT_SCENARIO_LENGTH,
  parseClientProfile,
  pickClientAvatar,
} from "../lib/chat/clientProfile";

describe("client avatars", () => {
  it("has five existing avatars for every gender option", () => {
    for (const gender of CLIENT_GENDERS) {
      const avatars = CLIENT_AVATARS[gender];
      assert.equal(new Set(avatars).size, 5, gender);
      for (const avatar of avatars) {
        assert.ok(existsSync(path.join("public", avatar)), avatar);
        assert.ok(CLIENT_AVATAR_LABELS[avatar], `${avatar} needs a label`);
      }
    }
  });

  it("uses the neutral set for nonbinary and prefer not to say", () => {
    assert.deepEqual(
      CLIENT_AVATARS["Prefer not to say"],
      CLIENT_AVATARS.Nonbinary,
    );
    assert.ok(CLIENT_AVATARS.Nonbinary.every((a) => a.includes("neutral-")));
  });

  it("picks from the matching set across the whole random range", () => {
    assert.equal(pickClientAvatar("Girl", null, () => 0), CLIENT_AVATARS.Girl[0]);
    assert.equal(
      pickClientAvatar("Girl", null, () => 0.9999),
      CLIENT_AVATARS.Girl[4],
    );
  });

  it("keeps the current avatar only while it matches the gender", () => {
    const boy = CLIENT_AVATARS.Boy[2];
    assert.equal(pickClientAvatar("Boy", boy, () => 0), boy);
    assert.ok(CLIENT_AVATARS.Girl.includes(pickClientAvatar("Girl", boy)));
  });
});

const VALID = {
  name: "  Mary-Jo   O'Neil ",
  gender: "Girl",
  age: "9",
  scenario: " Moved to a new school\nand misses her friends. ",
  avatar: "",
};

describe("parseClientProfile", () => {
  it("offers ages 4 through 17", () => {
    assert.deepEqual(CLIENT_AGES, [
      4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
    ]);
  });

  it("accepts prefer not to say as a gender", () => {
    assert.equal(
      parseClientProfile({ ...VALID, gender: "Prefer not to say" }).ok,
      true,
    );
  });

  it("normalizes whitespace and returns a typed profile", () => {
    const result = parseClientProfile(VALID);
    assert.deepEqual(result, {
      ok: true,
      profile: {
        name: "Mary-Jo O'Neil",
        gender: "Girl",
        age: 9,
        scenario: "Moved to a new school and misses her friends.",
        avatar: null,
      },
    });
  });

  it("accepts a manually chosen avatar only from the gender's set", () => {
    const chosen = CLIENT_AVATARS.Girl[3];
    const result = parseClientProfile({ ...VALID, avatar: chosen });
    assert.equal(result.ok && result.profile.avatar, chosen);

    const mismatched = parseClientProfile({
      ...VALID,
      avatar: CLIENT_AVATARS.Boy[0],
    });
    assert.equal(mismatched.ok, false);
    if (!mismatched.ok) assert.ok(mismatched.errors.avatar);

    const unknown = parseClientProfile({ ...VALID, avatar: "/evil.svg" });
    assert.equal(unknown.ok, false);
  });

  it("reports every missing field", () => {
    const result = parseClientProfile({
      name: " ",
      gender: "",
      age: "",
      scenario: "",
      avatar: "",
    });
    assert.equal(result.ok, false);
    if (!result.ok)
      assert.deepEqual(Object.keys(result.errors).sort(), [
        "age",
        "gender",
        "name",
        "scenario",
      ]);
  });

  it("rejects values outside the allowed choices and limits", () => {
    for (const [field, value] of [
      ["gender", "Robot"],
      ["age", "3"],
      ["age", "18"],
      ["age", "10.5"],
      ["name", "x".repeat(MAX_CLIENT_NAME_LENGTH + 1)],
      ["name", "<script>"],
      ["name", "R2D2"],
      ["scenario", "x".repeat(MAX_CLIENT_SCENARIO_LENGTH + 1)],
    ] as const) {
      const result = parseClientProfile({ ...VALID, [field]: value });
      assert.equal(result.ok, false, `${field}=${value}`);
      if (!result.ok) assert.ok(result.errors[field], `${field}=${value}`);
    }
  });
});
