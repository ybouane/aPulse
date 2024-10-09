import config from './config.json';
import Fastify from 'fastify';
import { Liquid } from 'liquidjs';
import fs from 'fs/promises';

const fastify = Fastify({ logger: true });
const liquidEngine = new Liquid();

// Define /logs.json endpoint
fastify.get('/logs.json', async (request, reply) => {
	const logs = [
		{ message: 'Server started', timestamp: '2024-10-08T10:00:00Z' },
		{ message: 'Endpoint /logs.json accessed', timestamp: '2024-10-08T10:05:00Z' }
	];
	return reply.send(logs);
});

// Define / endpoint to parse and render Liquid template
fastify.get('/data.json', async (request, reply) => {
	try {
		const templateContent = await fs.readFile('./template.liquid', 'utf-8');
		const htmlContent = await liquidEngine.parseAndRender(templateContent, {  });
		reply.type('text/html').send(htmlContent);
	} catch (error) {
		reply.code(500).send({ error: 'Error rendering template' });
	}
});

// Define /static/* endpoint to serve static files if they exist
fastify.get('/static/*', async (request, reply) => {
	try {
		const filePath = path.join(process.cwd(), request.params['*']);
		const fileExt = path.extname(filePath).toLowerCase();
		const fileContent = await fs.readFile(filePath);
		reply.type({
			".html": "text/html",
			".css": "text/css",
			".js": "application/javascript",
			".json": "application/json",
			".png": "image/png",
			".jpg": "image/jpeg",
			".jpeg": "image/jpeg",
			".gif": "image/gif",
			".svg": "image/svg+xml"
		}[filePath] || 'application/octet-stream').send(fileContent);
	} catch (error) {
		reply.code(404).send({ error: 'File not found' });
	}
});

// Start the Fastify server
try {
	await fastify.listen({ port: config.port });
	console.log('Pulse Running on PORT '+config.port);
} catch (err) {
	fastify.log.error(err);
	process.exit(1);
}