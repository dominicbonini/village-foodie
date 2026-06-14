import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Dead duplicate of the live page.tsx (backlog: delete separately) — don't lint it. Matched by
    // filename because the [token] path segment is a glob character-class, not a literal.
    "**/page 2.tsx",
  ]),
  // Recurrence guard for the seconds bug: an event-time field (start_time/end_time/startTime/
  // endTime) rendered as JSX TEXT (e.g. {ev.startTime} inside an element) is flagged — it leaks the
  // raw 'HH:MM:SS'. Render via formatTime()/formatTimeRange() (lib/time-utils) instead. Scoped so
  // it does NOT false-positive on:
  //   - JSX ATTRIBUTE values / prop pass-through (value={x.start_time}, end_time={x.end_time}) —
  //     only :matches(JSXElement, JSXFragment) > … children are checked, not JSXAttribute values;
  //   - form validation objects (formErrors.start_time) — excluded by object.name;
  //   - time-math ({x.end_time.split(':')…}) — the container's child is the CallExpression, not the
  //     bare member. .tsx only. Occasional eslint-disable is fine for a legitimate non-display use.
  {
    files: ["**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            ":matches(JSXElement, JSXFragment) > JSXExpressionContainer > MemberExpression[property.name=/^(start_time|end_time|startTime|endTime)$/][object.name!='formErrors']",
          message:
            "Render event times via formatTime/formatTimeRange (lib/time-utils) — never raw, to avoid showing seconds.",
        },
      ],
    },
  },
]);

export default eslintConfig;
