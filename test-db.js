require('dotenv').config();
const db = require('./src/main/utils/db-mysql');

async function testConnection() {
  try {
    console.log('\n🔍 Testing MySQL Database Connection...\n');
    console.log('Configuration:');
    console.log('  Host:', process.env.DB_HOST || 'Not set');
    console.log('  Port:', process.env.DB_PORT || 'Not set');
    console.log('  User:', process.env.DB_USER || 'Not set');
    console.log('  Database:', process.env.DB_NAME || 'Not set');
    console.log('  Password:', process.env.DB_PASSWORD ? '********' : 'Not set');
    console.log('');

    // Test connection
    await db.initDb();
    console.log('✅ Database connected successfully!\n');

    // Test tables
    console.log('📊 Testing database tables...');
    const tables = await db.query('SHOW TABLES');
    console.log(`  Found ${tables.length} tables:`);
    tables.forEach((table) => {
      const tableName = Object.values(table)[0];
      console.log(`    - ${tableName}`);
    });
    console.log('');

    // Test user count
    const userCount = await db.getUserCount();
    console.log(`👥 User count: ${userCount}`);

    // Test blog count
    const blogs = await db.getBlogs({ limit: 1 });
    console.log(`📝 Blog count: checking...`);
    const blogCount = await db.query('SELECT COUNT(*) as count FROM blogs');
    console.log(`📝 Blog count: ${blogCount[0].count}`);
    console.log('');

    // Connection info
    console.log('✅ All tests passed!');
    console.log('📡 Database is ready to use.\n');

    await db.closeDb();
    console.log('Connection closed.\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database connection failed!\n');
    console.error('Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Check your .env file has correct credentials');
    console.error('  2. Verify database server is running');
    console.error('  3. Check firewall allows port 3306');
    console.error('  4. Ensure database exists and user has permissions\n');
    process.exit(1);
  }
}

testConnection();
