#!/usr/bin/env node

const pify = require(`pify`)
const { readFile, writeFile } = pify(require(`fs`))
const { join: joinPath } = require(`path`)

const untildify = require(`untildify`)
const makeDir = require(`make-dir`)

const mdExtension = `.md`

const groupByFolder = metadatas => {
	const grouped = Object.create(null)

	metadatas.forEach(metadata => {
		const name = metadata.title
		const splitOnSlashes = name.split(/\//g)

		const title = splitOnSlashes.pop()
		const heading = splitOnSlashes.join(` – `)

		grouped[heading] = grouped[heading] || []
		grouped[heading].push({
			...metadata,
			title,
		})
	})

	return grouped
}

const joinish = (prefix, title) => prefix ? `${ prefix }/${ title }` : title

const main = async({ path, tagFolder, minimumTaggedNotes: minimumTaggedNotesString }) => {
	const minimumTaggedNotes = parseInt(minimumTaggedNotesString, 10)
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

			if (metadatas.length > minimumTaggedNotes) {
				const grouped = groupByFolder(metadatas)

				const contents = `\n` + Object.entries(grouped)
					.sort(([ headingA ], [ headingB ]) => headingA.localeCompare(headingB))
					.map(([ heading, metadatas ]) => {
						const list = metadatas.sort(({ mtime: a }, { mtime: b }) => a - b)
							.map(({ title }) => `- [[${ joinish(heading, title) }|${ title }]]`)
							.join(`\n`)

						return heading
							? `## ${ heading }\n\n${ list }\n`
							: `${ list }\n`
					})
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
			const lowercaseTag = tag.toLowerCase()
			const hashes = tagsToHashes.get(lowercaseTag) || []
			hashes.push(hash)
			tagsToHashes.set(lowercaseTag, hashes)
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



const [ ,, path, tagFolder = `Tags`, minimumTaggedNotes = `1` ] = process.argv

main({ path, tagFolder, minimumTaggedNotes }).catch(err => {
	console.error(err)
	process.exit(1)
})
