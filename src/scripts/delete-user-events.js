
/**
 * Script per esborrar tots els events d'un usuari específic de la base de dades PostgreSQL
 *
 * Ús:
 *   node src/scripts/delete-user-events.js "Trevor Smart"
 *
 * Variables d'entorn requerides:
 *   DATABASE_URL - URL de connexió PostgreSQL
 *   DATABASE_SSL - true/false (opcional, per defecte false)
 *
 * Exemple:
 *   DATABASE_URL="postgresql://user:pass@host/db" DATABASE_SSL=true node src/scripts/delete-user-events.js "Trevor Smart"
 */

require('dotenv').config();
const {Pool} = require('pg');

const userName = process.argv[2];

if (!userName) {
	console.error('Error: Has de proporcionar el nom de l\'usuari');
	console.error('Ús: node src/scripts/delete-user-events.js "Nom Usuari"');
	process.exit(1);
}

if (!process.env.DATABASE_URL) {
	console.error('Error: DATABASE_URL no està configurada');
	console.error('Configura-la com a variable d\'entorn o al fitxer .env');
	process.exit(1);
}

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized: false} : false
});

async function deleteUserEvents() {
	try {
		console.log('Connectant a la base de dades...');
		await pool.query('SELECT NOW()');
		console.log('✓ Connexió establerta');

		// Primer, comptar quants events hi ha per aquest usuari
		console.log(`\nComptant events per l'usuari "${userName}"...`);
		const countResult = await pool.query(`
			SELECT COUNT(*) as total
			FROM telemetry_events
			WHERE user_id = $1
			   OR data->>'userName' = $1
			   OR data->>'user_name' = $1
			   OR data->'user'->>'name' = $1
		`, [userName]);

		const totalEvents = Number.parseInt(countResult.rows[0].total, 10);
		console.log(`✓ Trobats ${totalEvents} events per l'usuari "${userName}"`);

		if (totalEvents === 0) {
			console.log('\nNo hi ha events per esborrar.');
			await pool.end();
			return;
		}

		// Demanar confirmació
		console.log(`\n⚠️  ATENCIÓ: Això esborrarà ${totalEvents} events de forma permanent.`);
		console.log('Prem Ctrl+C per cancel·lar o Enter per continuar...');

		// Esperar entrada de l'usuari (en un entorn no interactiu, continuarà automàticament)
		// Per a producció, podem fer-ho directe o amb una flag --confirm
		const confirmFlag = process.argv.includes('--confirm');

		if (!confirmFlag) {
			// En un entorn interactiu, podríem usar readline, però per simplicitat
			// assumim que si no hi ha --confirm, no executem
			console.log('\nPer executar l\'esborrat, afegeix la flag --confirm:');
			console.log(`node src/scripts/delete-user-events.js "${userName}" --confirm`);
			await pool.end();
			return;
		}

		// Esborrar events
		console.log(`\nEsborrant ${totalEvents} events...`);
		const deleteResult = await pool.query(`
			DELETE FROM telemetry_events
			WHERE user_id = $1
			   OR data->>'userName' = $1
			   OR data->>'user_name' = $1
			   OR data->'user'->>'name' = $1
		`, [userName]);

		const deletedCount = deleteResult.rowCount;
		console.log(`✓ Esborrats ${deletedCount} events`);

		await pool.end();
		console.log('\n✓ Operació completada');
	} catch (error) {
		console.error('\n✗ Error durant l\'esborrat:', error.message);
		console.error(error.stack);
		await pool.end();
		process.exit(1);
	}
}

deleteUserEvents();




