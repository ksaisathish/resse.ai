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

// watchFolders alone isn't enough: Metro's node_modules search walks up from
// the FILE doing the importing, so a module inside packages/tts/src looking
// for "react" walks up through packages/tts/node_modules and the repo-root
// node_modules — never this app's own node_modules, where react/react-native
// actually live (the @resse/* packages only declare them as peerDependencies
// on purpose, to avoid a second copy). This adds this app's own
// node_modules — and the repo root's, for anything hoisted there — as
// resolution roots for every module, regardless of which watched folder is
// doing the requiring. Standard fix for Expo + Metro monorepo setups:
// https://docs.expo.dev/guides/monorepos/
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "../../node_modules"),
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
