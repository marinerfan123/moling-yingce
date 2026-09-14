export default [
  {
    ignores: ["dist/**", "node_modules/**", "pnpm-lock.yaml", "docs/**", "tests/fixtures/**"],
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: {},
  },
];
