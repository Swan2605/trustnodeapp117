const User = require('../models/User');
const Message = require('../models/Message');
const Post = require('../models/Post');
const File = require('../models/File');
const SecurityLog = require('../models/SecurityLog');

/**
 * Delete inactive users (no login for 90 days)
 * Also deletes associated messages, posts, files, and logs
 */
const deleteInactiveUsers = async () => {
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    
    console.log(`\n Running cleanup: Looking for users inactive since ${ninetyDaysAgo.toISOString()}`);

    // Set a timeout for the query
    const queryPromise = User.find({
      'lastLogin.timestamp': { $lt: ninetyDaysAgo }
    }).maxTimeMS(5000); // 5 second timeout

    const inactiveUsers = await queryPromise;

    if (inactiveUsers.length === 0) {
      console.log(' No inactive users found. All accounts are recent or active.');
      return;
    }

    console.log(`⚠️  Found ${inactiveUsers.length} inactive user(s) to delete`);

    for (const user of inactiveUsers) {
      console.log(`  Deleting user: ${user.username} (last login: ${user.lastLogin.timestamp})`);

      // Delete all associated data
      await Promise.all([
        Message.deleteMany({ $or: [{ from: user._id }, { to: user._id }] }),
        Post.deleteMany({ user: user._id }),
        File.deleteMany({ user: user._id }),
        SecurityLog.deleteMany({ user: user._id })
      ]);

      // Delete the user
      await User.findByIdAndDelete(user._id);
      console.log(` User ${user.username} and all associated data deleted`);
    }

    console.log(`\n Cleanup complete! Deleted ${inactiveUsers.length} inactive user(s)\n`);
  } catch (error) {
    console.error('❌ Cleanup scheduler error:', error.message);
  }
};

module.exports = { deleteInactiveUsers };
