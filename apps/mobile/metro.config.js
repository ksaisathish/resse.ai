const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Local @resse/* packages ship TS source directly (no build step) and live
// outside this app's own tree via `file:` deps in package.json — Metro only
// watches this project by default, so without this it can resolve the
// package's entry file but not the rest of its source tree.
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(__dirname, "../../packages/talking-avatar"),
  path.resolve(__dirname, "../../packages/tts"),
  path.resolve(__dirname, "../../packages/stt"),
  path.resolve(__dirname, "../../packages/presence"),
  path.resolve(__dirname, "../../packages/tool-status-banner"),
];

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "jose" || moduleName.startsWith("jose/")) {
    return context.resolveRequest(
      {
        ...context,
        unstable_conditionNames: ["browser", "require", "import"],
      },
      moduleName,
      platform,
    );
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
