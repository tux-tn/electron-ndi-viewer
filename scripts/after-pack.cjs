/* eslint-disable @typescript-eslint/no-require-imports */

const { cpSync, existsSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { normalizeArch, packagesForTarget, supportedTargets } = require('./grandi-platform.cjs')

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName
  const arch = normalizeArch(context.arch)
  const packages = packagesForTarget(platform, arch)

  if (packages.length === 0) {
    throw new Error(
      `Unsupported Grandi target: ${platform}/${arch ?? context.arch}. Supported targets:\n  ${supportedTargets()}`
    )
  }

  // electron-builder does not reliably include manually materialized optional
  // platform packages when cross-building. Copy the target Grandi package into
  // app.asar.unpacked where Node's native addon loader can load it at runtime.
  for (const packageName of packages) {
    const packagePath = packageName.split('/')
    const source = join(context.packager.projectDir, 'node_modules', ...packagePath)
    if (!existsSync(source)) {
      throw new Error(
        `Missing node_modules/${packageName}. Run \`npm run prepare:grandi -- ${packageName}\` or \`npm run prepare:grandi -- ${platform} ${arch}\` before packaging.\nSupported targets:\n  ${supportedTargets()}`
      )
    }

    const destination = join(
      context.appOutDir,
      'resources',
      'app.asar.unpacked',
      'node_modules',
      ...packagePath
    )
    mkdirSync(join(destination, '..'), { recursive: true })
    cpSync(source, destination, { recursive: true })
  }
}
