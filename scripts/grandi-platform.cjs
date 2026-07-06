/* eslint-disable @typescript-eslint/explicit-function-return-type */

const PLATFORM_PACKAGES = {
  darwin: {
    x64: '@grandi/darwin-x64',
    arm64: '@grandi/darwin-arm64'
  },
  linux: {
    x64: '@grandi/linux-x64',
    arm64: '@grandi/linux-arm64',
    arm: '@grandi/linux-armv7l',
    armv7l: '@grandi/linux-armv7l'
  },
  win32: {
    ia32: '@grandi/win32-ia32',
    x64: '@grandi/win32-x64'
  }
}

const normalizeArch = (arch) => {
  if (typeof arch === 'string') return arch
  // electron-builder passes builder-util's Arch enum values to afterPack.
  return {
    0: 'ia32',
    1: 'x64',
    2: 'armv7l',
    3: 'arm64',
    4: 'universal'
  }[arch]
}

const packagesForTarget = (platform, arch) => {
  const normalizedArch = normalizeArch(arch)
  if (platform === 'darwin' && normalizedArch === 'universal') {
    return [PLATFORM_PACKAGES.darwin.x64, PLATFORM_PACKAGES.darwin.arm64]
  }

  const packageName = PLATFORM_PACKAGES[platform]?.[normalizedArch]
  return packageName ? [packageName] : []
}

const supportedTargets = () =>
  Object.entries(PLATFORM_PACKAGES)
    .flatMap(([platform, archPackages]) =>
      Object.entries(archPackages).map(
        ([arch, packageName]) => `${platform}/${arch}: ${packageName}`
      )
    )
    .join('\n  ')

module.exports = {
  normalizeArch,
  packagesForTarget,
  supportedTargets
}
