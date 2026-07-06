/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */

const { execFileSync } = require('node:child_process')
const { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { packagesForTarget, supportedTargets } = require('./grandi-platform.cjs')

const root = resolve(__dirname, '..')
const packageJson = require(join(root, 'package.json'))

const resolveRequestedPackages = (args) => {
  if (args.length === 0) return packagesForTarget(process.platform, process.arch)
  if (args.every((arg) => arg.startsWith('@grandi/'))) return args
  if (args.length === 2) return packagesForTarget(args[0], args[1])
  throw new Error(
    `Usage: node scripts/ensure-grandi-platform.js [@grandi/package | platform arch]\nSupported targets:\n  ${supportedTargets()}`
  )
}

// npm skips optional dependencies that do not match the host OS. When cross-building,
// materialize Grandi's target native package manually so electron-builder can bundle it.
const packages = resolveRequestedPackages(process.argv.slice(2))
if (packages.length === 0) {
  throw new Error(`Unsupported Grandi target. Supported targets:\n  ${supportedTargets()}`)
}

for (const packageName of packages) {
  const version = packageJson.optionalDependencies?.[packageName]
  if (!version) {
    throw new Error(`${packageName} must be listed in optionalDependencies`)
  }

  const destination = join(root, 'node_modules', ...packageName.split('/'))
  if (existsSync(destination)) {
    console.log(`${packageName} already exists`)
    continue
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'grandi-platform-'))
  try {
    try {
      mkdirSync(join(root, 'node_modules', '@grandi'), { recursive: true })
    } catch (error) {
      if (error?.code === 'EACCES') {
        throw new Error(
          'Cannot write to node_modules/@grandi. Remove node_modules and run npm install again, or fix directory ownership.'
        )
      }
      throw error
    }
    const tarballName = execFileSync(
      'npm',
      ['pack', `${packageName}@${version}`, '--pack-destination', tempDir],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
    )
      .trim()
      .split('\n')
      .at(-1)

    if (!tarballName) throw new Error(`npm pack did not return a tarball for ${packageName}`)

    execFileSync('tar', ['-xzf', join(tempDir, tarballName), '-C', tempDir], { stdio: 'inherit' })
    try {
      cpSync(join(tempDir, 'package'), destination, { recursive: true })
    } catch (error) {
      if (error?.code === 'EACCES') {
        throw new Error(
          `Cannot install ${packageName} into node_modules. Remove node_modules and run npm install again, or fix directory ownership.`
        )
      }
      throw error
    }
    console.log(`Installed ${packageName}@${version}`)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}
