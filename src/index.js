const { MongoClient, ObjectID } = require("mongodb");
const R = require("ramda");

/**
 * Checks if the given value is of the form
 * ```
 * {
 *   "collection": "nameOfACollection",
 *   "id": "documentIdInStringForm"
 * }
 * ```
 *
 * @param {*} value
 */
const isDbRef = R.allPass([R.is(Object), R.has("collection"), R.has("id")]);

/**
 * Connects to a MongoDB instance and returns a client and a database handle.
 *
 * @param {String} uri URI of the mongodb instance.
 * @param {String} dbName Name of the database to connect to.
 */
async function connect(uri, dbName) {
  try {
    const client = await MongoClient.connect(uri, { useNewUrlParser: true });
    console.log("Connected to database");
    return { client, db: client.db(dbName) };
  } catch (err) {
    console.error(`Could not connect to database: ${err}`);
    throw err;
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
 * Resolves the DbRefs in a given `document` that point to one of the given list
 * of `collections` recursively up to `depth` level.
 * If `collections` is null, all references are resolved.
 *
 * Does not check for cycles! Use `depth` if you know that there are cyclic
 * references.
 *
 * @param {*} db A mongodb database handle.
 * @param {*} document A document in which DbRefs should be resolved.
 * @param {Array<String>} collections A list of collection to which DbRefs should be resolved.
 * @param {Number} depth The depth of references to resolve. Not the depth of object nesting.
 */
async function resolveDbRefs(db, document, collections = null, depth = -1) {
  if (depth === 0) {
    return document;
  }
  for (const key in document) {
    const value = document[key];
    if (isDbRef(value)) {
      if (!R.isNil(collections) && !collections.includes(value.collection))
        continue;
      const refDocument = await resolveDbRef(db, value);
      document[key] = await resolveDbRefs(
        db,
        refDocument,
        collections,
        depth - 1
      );
    } else if (R.is(Array, value)) {
      const values = value;
      document[key] = await Promise.all(
        values.map(async v => {
          if (!isDbRef(v)) return v;
          if (!R.isNil(collections) && !collections.includes(v.collection))
            return v;
          const refDocument = await resolveDbRef(db, v);
          return resolveDbRefs(db, refDocument, collections, depth - 1);
        })
      );
    }
  }
  return document;
}

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
  extractInsertedIdsFromMongoDBResult,
  isDbRef,
  connect,
  resolveDbRefs,
  stripIds
};
