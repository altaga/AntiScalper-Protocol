const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const x402Root = path.resolve(projectRoot, '..', '@altaga-x402-sui');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);
config.resolver.assetExts.push('wasm');
config.resolver.unstable_enablePackageExports = true;

// file:../@altaga-x402-sui lives outside projectRoot. Without watchFolders +
// disableHierarchicalLookup, Metro resolves @mysten/* from the sibling folder
// (miss) instead of asp-dapp/node_modules (hit).
config.watchFolders = [x402Root];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
