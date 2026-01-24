const path = require('path');

module.exports = {
    images: {
    domains: ['cdn.download.ams.birds.cornell.edu'],
  },
  reactCompiler: true,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.module.rules.push({
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
        include: /node_modules/,
      });
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        // Alias problematic CSS imports to an empty string
        '/assets/codicon-DCmgc-ay.ttf': path.resolve(__dirname, 'empty.js')
      };
    }
    return config;
  },
  turbopack: {},
};
