import pkg from './package.json' with {type:'json'}

export default  {
	// import name from package.json
	name: pkg.name,
	triggers: {
		keywords: [
			'npm',
			'package info',
			'packages like',
			'compare packages',
			'npm alternatives',
			'best npm package',
			'npm package for',
			'library for',
			'date formatting',
			'package for',
			'find package',
			'recommend package',
			'need package'
		]
		// in the future, we can add other types of triggers
	},
	query_format: {
		regex: [
			'(npm( packages?)?|package info) HD_PACKAGES.NPM_PACKAGES',
			'(latest|current) version of HD_PACKAGES.NPM_PACKAGES',
			'compare( npm)?( packages?)? HD_PACKAGES.NPM_PACKAGES [v]?[0-9]+(\\.[0-9]+){0,2} (vs|versus) [v]?[0-9]+(\\.[0-9]+){0,2}',
			'compare packages? .+',
			'compare( packages?)? [@\\w][\\w./@-]*(,| vs| versus| and) ?[@\\w][\\w./@-]*(?:(,| vs| versus| and) ?[@\\w][\\w./@-]*)?',
			'compare packages? HD_PACKAGES.NPM_PACKAGES, HD_PACKAGES.NPM_PACKAGES(, HD_PACKAGES.NPM_PACKAGES)?',
			'compare( npm)?( packages?)? HD_PACKAGES.NPM_PACKAGES(,| vs| versus| and) HD_PACKAGES.NPM_PACKAGES((,| vs| versus| and) HD_PACKAGES.NPM_PACKAGES)?',
			'(npm )?(alternatives?( to| for)|packages? (like|similar to)) HD_PACKAGES.NPM_PACKAGES( npm)?',
			'(best (npm )?(package|library|module|tool)( for)?|npm (package|library|module|tool) for|library for|libraries for|package for) .+',
			'(find|recommend|suggest|need|looking for) (an? )?(npm )?(package|library|module|tool|utility) .+',
			'date formatting',
			'npm .+',
			'HD_PACKAGES.NPM_PACKAGES'
		]
		// in the future, we can add other types of query formats
	},
	client: {
		// location of client side code
		// should point to pkg.umd - but currently that points to dist/index.umd.js
		location: pkg.module,
		// name of the UMD module
		moduleName: pkg.umdName || 'HD' + pkg.name,
		// baseURL is only used in local testing and ignored after publish
		// Optional: defaults to '/name' (the name of the component)
		baseURL: '/' + pkg.name,

	},
	format: {
		mainline: true,
		sidebar: true
		// "sidebar" / "mainline" / "ribbon" / "fullscreen"
	},
	permissions: {
		
	},
	info: {
		// key-values added here will be added to the compInfo section of searchData
	},
	github: "https://github.com/RishuRanjan11/Package_Info",
	demovideo: "https://youtu.be/c-YuHO-PGHs"
}
