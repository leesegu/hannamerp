// functions/.eslintrc.js
module.exports = {
  env: { es6: true, node: true },
  parserOptions: { ecmaVersion: 2020 },
  extends: [
    "eslint:recommended",
    "google", // devDependency: eslint-config-google 필요
  ],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    "quotes": ["error", "double", { "allowTemplateLiterals": true }],
    // Functions v2에서 종종 경고되는 규칙 조금 완화 (선택)
    "no-console": "off",
  },
  overrides: [
    {
      files: ["**/*.spec.*"],
      env: { mocha: true },
      rules: {},
    },
  ],
  globals: {},
};
