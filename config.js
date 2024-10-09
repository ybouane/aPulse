export default {
	verbose				: true,
	interval			: 15, // In minutes
	responseTimeGood	: 300, // In milliseconds, this and below will be green
	responseTimeWarning	: 600, // In milliseconds, above this will be red
	timeout				: 5000, // In milliseconds, requests will be aborted above this. (Do not )
	readableStatusJson	: true, // Format status.json to be human readable
	logsMaxDatapoints	: 200, // Maximum datapoints history to keep (per endpoint)
	sites				: [
		{
			id				: 'google', // optional
			name			: 'Google',
			endpoints		: [
				{
					id				: 'homepage', // optional
					name			: 'Homepage',
					url				: 'https://www.google.com',
					request			: {
						method: 'GET',
					},
					mustFind		: 'Feeling Lucky', // String | Regex | Function | AsyncFunction
					mustNotFind		: /not found/i,
					followRedirects	: true,
					validStatus		: [200],
				}
			]
		}
	],
};