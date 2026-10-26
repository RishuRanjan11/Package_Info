import pkg from './package.json' with {type:'json'}

export default  {
	// import name from package.json
	name: pkg.name,
	triggers: {
		keywords: ['', '']
		// in the future, we can add other types of triggers
	},
	query_format: {
		regex: [
			'',
			''
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
	github: "",
	demovideo: ""
}
