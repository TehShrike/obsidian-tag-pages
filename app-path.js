// lifted from https://github.com/sindresorhus/env-paths/blob/master/index.js
const path = require(`path`)

const homedir = require(`os`).homedir()
const { env } = process

const macos = name => {
	const library = path.join(homedir, `Library`)

	return path.join(library, `Application Support`, name)
}

const windows = name => {
	const localAppData = env.LOCALAPPDATA || path.join(homedir, `AppData`, `Local`)

	return path.join(localAppData, name, `Data`)
}

// https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html
const linux = name => path.join(env.XDG_DATA_HOME || path.join(homedir, `.local`, `share`), name)

module.exports = () => {
	const name = `obsidian`

	if (process.platform === `darwin`) {
		return macos(name)
	}

	if (process.platform === `win32`) {
		return windows(name)
	}

	return linux(name)
}
