
// Séparation artificielle, temporaire, entre ces deux types de règles
import rawRules from './load-rules'
import R from 'ramda'
import possibleVariableTypes from './possibleVariableTypes.yaml'
import marked from './marked'

 // console.log('rawRules', rawRules.map(({espace, nom}) => espace + nom))
/***********************************
 Méthodes agissant sur une règle */

// Enrichissement de la règle avec des informations évidentes pour un lecteur humain
export let enrichRule = rule => {
	let
		type = possibleVariableTypes.find(t => R.has(t, rule)),
		name = rule['nom'],
		ns = rule['espace'],
		dottedName = ns ? [
			ns,
			name
		].join(' . ') : name,
		subquestionMarkdown = rule['sous-question'],
		subquestion = subquestionMarkdown && marked(subquestionMarkdown)

	return {...rule, type, name, ns, dottedName, subquestion}
}

export let hasKnownRuleType = rule => rule && enrichRule(rule).type

export let
	splitName = R.split(' . '),
	joinName = R.join(' . ')

export let parentName = R.pipe(
	splitName,
	R.dropLast(1),
	joinName
)
export let nameLeaf = R.pipe(
	splitName,
	R.last
)

export let encodeRuleName = name => name.replace(/\s/g, '-')
export let decodeRuleName = name => name.replace(/\-/g, ' ')

/* Les variables peuvent être exprimées dans la formule d'une règle relativement à son propre espace de nom, pour une plus grande lisibilité. Cette fonction résoud cette ambiguité.
*/

export let disambiguateRuleReference = (allRules, {ns, name}, partialName) => {
	let
		fragments = ns ? ns.split(' . ') : [], // ex. [CDD . événements . rupture]
		pathPossibilities = // -> [ [CDD . événements . rupture], [CDD . événements], [CDD] ]
			R.range(0, fragments.length + 1)
			.map(nbEl => R.take(nbEl)(fragments))
			.reverse(),
		found = R.reduce((res, path) =>
			R.when(
				R.is(Object), R.reduced
			)(findRuleByDottedName(allRules, [...path, partialName].join(' . ')))
		, null, pathPossibilities)

	return found && found.dottedName || do {throw `OUUUUPS la référence '${partialName}' dans la règle '${name}' est introuvable dans la base`}
}

// On enrichit la base de règles avec des propriétés dérivées de celles du YAML
export let rules = rawRules.map(enrichRule)


/****************************************
 Méthodes de recherche d'une règle */

export let findRuleByName = (allRules, search) =>
	allRules
		.find( ({name}) =>
			name.toLowerCase() === search.toLowerCase()
		)

export let searchRules = searchInput =>
	rules
		.filter( rule =>
			rule && hasKnownRuleType(rule) &&
			JSON.stringify(rule).toLowerCase().indexOf(searchInput) > -1)
		.map(enrichRule)

export let findRuleByDottedName = (allRules, dottedName) => {
	let found = dottedName && allRules.find(rule => rule.dottedName.toLowerCase() == dottedName.toLowerCase()),
		result = dottedName && dottedName.startsWith("sys .") ?
					found || {dottedName: dottedName, nodeValue: null} :
					found

	return result
}

/*********************************
Autres */

let isVariant = R.path(['formule', 'une possibilité'])

export let findVariantsAndRecords = (allRules, names) => {
	let tag = name => {
		let parent = parentName(name),
			gramps = parentName(parent),
			findV  = name => isVariant(findRuleByDottedName(allRules,name))

		return findV(gramps) ? {type: "variantGroups", [gramps]:[name]}
			   : findV(parent) ? {type: "variantGroups", [parent]:[name]}
			   : {type: "recordGroups", [parent]:[name]}
	}

	let classify = R.map(tag),
		groupByType = R.groupBy(R.prop("type")),
		stripTypes = R.map(R.map(R.omit("type"))),
		mergeLists = R.map(R.reduce(R.mergeWith(R.concat),{}))

	return R.pipe(classify,groupByType,stripTypes,mergeLists)(names)
}

export let findVariantsAndRecords2 =
	(allRules, {variantGroups, recordGroups}, dottedName, childDottedName) => {
		let child = findRuleByDottedName(allRules, dottedName),
			parentDottedName = parentName(dottedName),
			parent = findRuleByDottedName(allRules, parentDottedName)
		if (isVariant(parent)) {
			let grandParentDottedName = parentName(parentDottedName),
				grandParent = findRuleByDottedName(allRules, grandParentDottedName)
			if (isVariant(grandParent))
				return findVariantsAndRecords2(allRules, {variantGroups, recordGroups}, parentDottedName, childDottedName || dottedName)
			else
				return {
					variantGroups: R.mergeWith(R.concat, variantGroups, {[parentDottedName]: [childDottedName || dottedName]}),
					recordGroups
				}
		} else
				return {
					variantGroups,
					recordGroups: R.mergeWith(R.concat, recordGroups, {[parentDottedName]: [dottedName]})
				}

	}
