const { MongoClient, ObjectID } = require("mongodb");
const R = require("ramda");

const DbRef = require("./DbRef");

/**
 * Connects to a MongoDB instance and returns a client and a database handle.
 *
 * @param {String} uri URI of the mongodb instance.
 * @param {String} dbName Name of the database to connect to.
 */
async function connect(uri, dbName) {
  try {
    const client = await MongoClient.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB.");
    return { client, db: client.db(dbName) };
  } catch (ex) {
    console.error(`Could not connect to MongoDB.`, { ex });
    throw ex;
  }
}

/**
 * Extracts the resulting inserted Id(s) of a mongodb query.
 *
 * @param {*} mongoDBResult
 * @return {Array} of database ids
 */
function extractInsertedIdsFromMongoDBResult(mongoDBResult) {
  if (R.is(Object, mongoDBResult.insertedIds)) {
    const keys = Object.keys(mongoDBResult.insertedIds);
    const insertedIds = Array(keys.length);
    for (let key of keys) {
      insertedIds[Number.parseInt(key)] = mongoDBResult.insertedIds[
        key
      ].toString();
    }
    return insertedIds;
  }
  return mongoDBResult.insertedId;
}

/**
 * Resolves a DbRef to its value in the database.
 * Fails if the collection or the id doesn't exist.
 *
 * @param {*} db A mongodb database handle.
 * @param {*} dbref A dbRef object.
 */
async function resolveDbRef(db, dbref) {
  const resolved = await db
    .collection(dbref.collection)
    .findOne({ _id: new ObjectID(dbref.id) });
  if (R.isNil(resolved))
    throw Error(
      `Referenced '${dbref.collection}' '${dbref.id}' could not be resolved`
    );
  return resolved;
}

/**
 * Given a mongodb document, finds and resolves DbRefs in that document.
 *
 * @param {*} db A mongodb database handle.
 * @param {*} document A document in which DbRefs should be resolved.
 * @param {Array<String>} collections A list of collection to which DbRefs should be resolved.
 * @param {Number} depth The depth of references to resolve. Not the depth of object nesting.
 */
const resolve = DbRef.resolve(resolveDbRef);

/**
 * Strips all `_id` fields from an object recursively.
 *
 * @param {*} document A document that contains mongodb `_id` fields.
 */
function stripIds(document) {
  if (!R.is(Object, document)) return document;
  else if (R.is(Array, document)) return document.map(stripIds);
  document = R.dissoc("_id", document);
  document = R.map(stripIds, document);
  return document;
}

module.exports = {
  connect,
  extractInsertedIdsFromMongoDBResult,
  stripIds,
  isDbRef: DbRef.isDbRef,
  resolve,
};
