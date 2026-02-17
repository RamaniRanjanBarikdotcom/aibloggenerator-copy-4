require('dotenv').config();
const db = require('./src/main/utils/db-mongodb');

async function testConnection() {
  try {
    console.log('\n🔍 Testing MongoDB Connection...\n');
    console.log('Configuration:');
    console.log('  URI:', process.env.MONGODB_URI ? '✅ Set (hidden for security)' : '❌ Not set');
    console.log('  Database:', process.env.MONGODB_DB_NAME || 'aiblog_generator');
    console.log('');

    // Test connection
    await db.initDb();
    console.log('✅ Database connected successfully!\n');

    // Test collections
    console.log('📊 Testing database collections...');
    const collections = await db.initDb().then((database) => database.listCollections().toArray());
    if (collections.length > 0) {
      console.log(`  Found ${collections.length} collections:`);
      collections.forEach((col) => {
        console.log(`    - ${col.name}`);
      });
    } else {
      console.log('  No collections yet (will be created when you use them)');
    }
    console.log('');

    // Test user count
    const userCount = await db.getUserCount();
    console.log(`👥 User count: ${userCount}`);

    // Test blog count
    const blogs = await db.getBlogs({ limit: 1 });
    const blogCount = blogs.length;
    console.log(`📝 Blog count: ${blogCount}`);
    console.log('');

    // Connection info
    console.log('✅ All tests passed!');
    console.log('📡 MongoDB Atlas is ready to use.\n');

    await db.closeDb();
    console.log('Connection closed.\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database connection failed!\n');
    console.error('Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Check your .env file has MONGODB_URI');
    console.error('  2. Verify connection string format: mongodb+srv://user:pass@cluster.mongodb.net/');
    console.error('  3. Check username and password are correct');
    console.error('  4. Verify your IP is whitelisted in MongoDB Atlas');
    console.error('  5. Make sure cluster is not paused\n');
    console.error('Full error:');
    console.error(error);
    console.error('');
    process.exit(1);
  }
}

testConnection();
