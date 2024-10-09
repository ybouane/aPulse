export default {
	verbose				: true,
	interval			: 15, // In minutes
	responseTimeGood	: 300, // In milliseconds, this and below will be green
	responseTimeWarning	: 600, // In milliseconds, above this will be red
	timeout				: 5000, // In milliseconds, requests will be aborted above this. (Do not )
	sites	: [
		{
			id			: 'google',
			name		: 'Google',
			endpoints	: [
				{
					name	: 'Homepage',
					url	: 'https://www.google.com',
					request	: {
						method: 'GET',
					},
					mustFind	: 'Feeling Lucky',
					mustNotFind	: /not found/i,
				}
			]
		}
	],
};