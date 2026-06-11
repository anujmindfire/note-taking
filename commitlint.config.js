module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'references-empty': [2, 'never'],
  },
  parserPreset: {
    parserOpts: {
      referenceActions: null,
      issuePrefixes: ['AB#', 'AB-'],
    },
  },
};
