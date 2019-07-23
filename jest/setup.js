const { MongoMemoryServer } = require("mongodb-memory-server");
/**
 * let mongodb-memory-server download the mongodb binary before running any
 * tests. This way the tests don't time out because of the long download.
 */
module.exports = async () => {
  const mongod = new MongoMemoryServer();
  await mongod.stop();
};
