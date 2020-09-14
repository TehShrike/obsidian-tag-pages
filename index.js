#!/usr/bin/env node

const pify = require(`pify`)
const { readFile, writeFile } = pify(require(`fs`))
const { join: joinPath } = require(`path`)

const untildify = require(`untildify`)
const makeDir = require(`make-dir`)
const pMap = require(`p-map`)

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

const joinFolderAndTitle = (folder, title) => folder ? `${ folder }/${ title }` : title
const joinNameAndHeading = (name, heading) => heading ? `${ name }#${ heading }` : name

const getPreviousHeading = (contents, line) => {
	const lines = contents.split(`\n`)

	let lastHeading = null
	for (let i = 0; i < line; ++i) {
		const match = lines[i].match(/^#+[ \t]+(.+)$/)
		if (match) {
			lastHeading = match[1].replace(/#/g, ``)
		}
	}

	return lastHeading
}

const main = async({ path, tagFolder, minimumTaggedNotes: minimumTaggedNotesString }) => {
	const minimumTaggedNotes = parseInt(minimumTaggedNotesString, 10)
	const vaultPath = untildify(path)
	const tagPath = joinPath(vaultPath, tagFolder)

	const cachePath = joinPath(vaultPath, `.obsidian`, `cache`)
	const cacheContents = JSON.parse(await readFile(cachePath))

	await makeDir(tagPath)

	const tagsWithHashes = getTagsWithHashes(cacheContents.metadata)
	const hashesToFileMetadata = getHashesToFileMetadata(cacheContents.files)

	await pMap(
		tagsWithHashes,
		async({ tag, hashesAndLines }) => {
			const metadataAndLines = hashesAndLines
				.map(({ hash, line }) => ({
					line,
					metadata: hashesToFileMetadata.get(hash),
				}))
				.filter(({ metadata }) => metadata)

			const metadatas = await pMap(metadataAndLines, async({ metadata: { title, mtime, filename }, line }) => {
				const contents = await readFile(joinPath(vaultPath, filename), { encoding: `utf8` })

				const heading = getPreviousHeading(contents, line)

				return {
					heading,
					title,
					mtime,
				}
			}, { concurrency: 5 })

			if (metadatas.length >= minimumTaggedNotes) {
				const grouped = groupByFolder(metadatas)

				const contents = `\n` + Object.entries(grouped)
					.sort(([ folderA ], [ folderB ]) => folderA.localeCompare(folderB))
					.map(([ folder, metadatas ]) => {
						const list = metadatas.sort(({ mtime: a }, { mtime: b }) => a - b)
							.map(({ title, heading }) => `- [[${ joinNameAndHeading(joinFolderAndTitle(folder, title), heading) }|${ joinNameAndHeading(title, heading) }]]`)
							.join(`\n`)

						return folder
							? `## ${ folder }\n\n${ list }\n`
							: `${ list }\n`
					})
					.join(`\n`)

				await writeFile(joinPath(tagPath, tag.slice(1) + mdExtension), contents)
			}
		},
		{ concurrency: 2 },
	)
}

const getTagsWithHashes = metadata => {
	const tagsToHashes = new Map()

	Object.entries(metadata).forEach(([ hash, { tags }]) => {
		tags.forEach(({ tag, line }) => {
			const lowercaseTag = tag.toLowerCase()
			const hashesAndLines = tagsToHashes.get(lowercaseTag) || []
			hashesAndLines.push({ hash, line })
			tagsToHashes.set(lowercaseTag, hashesAndLines)
		})
	})

	const entries = [ ...tagsToHashes.entries() ]

	return entries.map(([ tag, hashesAndLines ]) => ({ tag, hashesAndLines }))
}

const getHashesToFileMetadata = files => {
	const hashesToFileMetadata = new Map()

	Object.entries(files).forEach(([ filename, { mtime, hash }]) => {
		const title = filename.slice(0, -mdExtension.length)
		hashesToFileMetadata.set(hash, { title, mtime, filename })
	})

	return hashesToFileMetadata
}



const [ ,, path, tagFolder = `Tags`, minimumTaggedNotes = `1` ] = process.argv

main({ path, tagFolder, minimumTaggedNotes }).catch(err => {
	console.error(err)
	process.exit(1)
})
