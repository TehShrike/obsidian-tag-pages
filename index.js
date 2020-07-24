#!/usr/bin/env node

const pify = require(`pify`)
const { readFile, writeFile } = pify(require(`fs`))
const { join: joinPath } = require(`path`)

const untildify = require(`untildify`)
const makeDir = require(`make-dir`)

const mdExtension = `.md`

const main = async({ path, tagFolder }) => {
	const vaultPath = untildify(path)
	const tagPath = joinPath(vaultPath, tagFolder)

	const cachePath = joinPath(vaultPath, `.obsidian`, `cache`)
	const cacheContents = JSON.parse(await readFile(cachePath))

	await makeDir(tagPath)

	const tagsWithHashes = getTagsWithHashes(cacheContents.metadata)
	const hashesToFileMetadata = getHashesToFileMetadata(cacheContents.files)

	await Promise.all(
		tagsWithHashes.map(async({ tag, hashes }) => {
			const metadatas = hashes
				.map(hash => hashesToFileMetadata.get(hash))
				.filter(metadata => metadata)

			if (metadatas.length) {
				const contents = metadatas.sort(({ mtime: a }, { mtime: b }) => a - b)
					.map(({ title }) => `- [[${ title }]]`)
					.join(`\n`)

				await writeFile(joinPath(tagPath, tag.slice(1) + mdExtension), contents)
			}
		}),
	)
}

const getTagsWithHashes = metadata => {
	const tagsToHashes = new Map()

	Object.entries(metadata).forEach(([ hash, { tags }]) => {
		tags.forEach(({ tag }) => {
			const hashes = tagsToHashes.get(tag) || []
			hashes.push(hash)
			tagsToHashes.set(tag, hashes)
		})
	})

	const entries = [ ...tagsToHashes.entries() ]

	return entries.map(([ tag, hashes ]) => ({ tag, hashes }))
}

const getHashesToFileMetadata = files => {
	const hashesToFileMetadata = new Map()

	Object.entries(files).forEach(([ filename, { mtime, hash }]) => {
		const title = filename.slice(0, -mdExtension.length)
		hashesToFileMetadata.set(hash, { title, mtime })
	})

	return hashesToFileMetadata
}



const [ ,, path, tagFolder = `Tags` ] = process.argv

main({ path, tagFolder }).catch(err => {
	console.error(err)
	process.exit(1)
})
