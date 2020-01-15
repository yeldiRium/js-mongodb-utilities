const { MongoMemoryServer } = require("mongodb-memory-server");

const {
  connect,
  extractInsertedIdsFromMongoDBResult,
  isDbRef,
  resolve,
  stripIds
} = require("../");

async function setUpMemoryDb() {
  const mongod = new MongoMemoryServer();

  const uri = await mongod.getConnectionString();
  const dbName = await mongod.getDbName();

  const { client, db } = await connect(
    uri,
    dbName
  );

  return {
    client,
    db,
    mongod
  };
}

async function tearDownMemoryDb(mongod, client) {
  await client.close();
  await mongod.stop();
}

describe("isDbRef", () => {
  it("rejects a non-object", () => {
    const theValues = [
      null,
      "object",
      1,
      1.4567,
      Number.NaN,
      "ಠ_ಠ",
      ["( ͡° ͜ʖ ͡°)╭∩╮", "(╯ ͠° ͟ʖ ͡°)╯┻━┻", "( ͡° ͜ʖ ͡°)"]
    ];

    for (const v of theValues) {
      expect(isDbRef(v)).toBe(false);
    }
  });
  it("rejects an object without collection", () => {
    const notADbRef = {
      id: "path of exile"
    };
    expect(isDbRef(notADbRef)).toBe(false);
  });
  it("rejects an object without id", () => {
    const notADbRef = {
      collection: "of smelly socks"
    };
    expect(isDbRef(notADbRef)).toBe(false);
  });
  it("accepts a DbRef", () => {
    const definitelyADbRef = {
      id: "path of exile",
      collection: "of smelly socks"
    };
    expect(isDbRef(definitelyADbRef)).toBe(true);
  });
});

describe("extractInsertedIdsFromMongoDBResult", () => {
  let mongod, client, db;

  beforeAll(async () => {
    const dbStuffs = await setUpMemoryDb();
    mongod = dbStuffs.mongod;
    client = dbStuffs.client;
    db = dbStuffs.db;
  });

  afterAll(async () => {
    await tearDownMemoryDb(mongod, client);
  });

  it("extracts the id from an insertOne", async () => {
    const c1d1Result = await db.collection("c1").insertOne({
      thisIs: "c1d1"
    });
    const c1d1Id = c1d1Result.insertedId;
    expect(extractInsertedIdsFromMongoDBResult(c1d1Result)).toBe(c1d1Id);
  });

  it("extracts the ids from an insertMany", async () => {
    const c1dxResult = await db.collection("c1").insertMany([
      {
        thisIs: "c1d1"
      },
      {
        thisIs: "c1d2"
      },
      {
        thisIs: "c1d3"
      }
    ]);
    const ids = Object.values(c1dxResult.insertedIds).map(objId =>
      objId.toString()
    );
    expect(extractInsertedIdsFromMongoDBResult(c1dxResult)).toEqual(ids);
  });
});

describe("resolve", () => {
  let mongod, client, db;

  beforeAll(async () => {
    const dbStuffs = await setUpMemoryDb();
    mongod = dbStuffs.mongod;
    client = dbStuffs.client;
    db = dbStuffs.db;

    const c1d1Id = extractInsertedIdsFromMongoDBResult(
      await db.collection("c1").insertOne({
        thisIs: "c1d1"
      })
    );

    const c1d2Id = extractInsertedIdsFromMongoDBResult(
      await db.collection("c1").insertOne({
        thisIs: "c1d2"
      })
    );

    const c2d1Id = extractInsertedIdsFromMongoDBResult(
      await db.collection("c2").insertOne({
        thisIs: "c2d1",
        c1: {
          collection: "c1",
          id: c1d1Id
        }
      })
    );

    extractInsertedIdsFromMongoDBResult(
      await db.collection("c3").insertOne({
        thisIs: "c3d1",
        c1: [
          {
            collection: "c1",
            id: c1d1Id
          },
          {
            collection: "c1",
            id: c1d2Id
          }
        ],
        c2: {
          collection: "c2",
          id: c2d1Id
        }
      })
    );
    extractInsertedIdsFromMongoDBResult(
      await db.collection("c4").insertMany([
        {
          thisIs: "c4d1",
          c1: [
            {
              collection: "c1",
              id: c1d1Id
            },
            {
              collection: "c1",
              id: c1d2Id
            }
          ],
          c2: {
            collection: "c2",
            id: c2d1Id
          }
        },
        {
          thisIs: "c4d2",
          c1: [
            {
              collection: "c1",
              id: c1d1Id
            },
            {
              collection: "c1",
              id: c1d2Id
            }
          ],
          c2: {
            collection: "c2",
            id: c2d1Id
          }
        }
      ])
    );

    extractInsertedIdsFromMongoDBResult(
      await db.collection("c5").insertOne({
        thisIs: "c5d1",
        c1: [
          {
            nested: {
              collection: "c1",
              id: c1d1Id
            }
          },
          {
            nested: {
              collection: "c1",
              id: c1d1Id
            }
          }
        ]
      })
    );
  });

  it("does not resolve anything with depth 0", async () => {
    const document = await db.collection("c2").findOne();
    const resolved = await resolve(db, document, ["c1"], 0);
    expect(isDbRef(resolved.c1)).toBe(true);
  });

  it("resolves a single level of DbRefs", async () => {
    const document = await db.collection("c2").findOne();
    const resolved = await resolve(db, document, ["c1"], 1);
    expect(resolved.c1).toHaveProperty("thisIs");
  });

  it("does not resolve the wrong collections", async () => {
    const document = await db.collection("c3").findOne();
    const resolved = await resolve(db, document, ["c2"], 1);
    for (const d of resolved.c1) {
      expect(isDbRef(d)).toBe(true);
    }
    expect(resolved.c2).toHaveProperty("thisIs");
  });

  it("resolves arrays of DbRefs", async () => {
    const document = await db.collection("c2").findOne();
    const resolved = await resolve(db, document, ["c1"], 1);
    expect(isDbRef(resolved.c1)).toBe(false);
  });

  it("completely resolves an acyclic document", async () => {
    const document = await db.collection("c3").findOne();
    const resolved = await resolve(db, document);
    expect(resolved.c1[0]).toHaveProperty("thisIs");
    expect(resolved.c1[1]).toHaveProperty("thisIs");
    expect(resolved.c2).toHaveProperty("thisIs");
    expect(resolved.c2.c1).toHaveProperty("thisIs");
  });

  it("resolves an array of non-DbRef documents with DbRefs in them", async () => {
    const documents = await db
      .collection("c4")
      .find()
      .toArray();
    const resolved = await resolve(db, documents);
    for (const r of resolved) {
      expect(r.c1[0]).toHaveProperty("thisIs");
      expect(r.c1[1]).toHaveProperty("thisIs");
      expect(r.c2).toHaveProperty("thisIs");
      expect(r.c2.c1).toHaveProperty("thisIs");
    }
  });

  it("resolves a property, which is an array of non-DbRef documents with DbRefs in them", async () => {
    const document = await db.collection("c5").findOne();
    const resolved = await resolve(db, document);
    expect(resolved.c1[0].nested).toHaveProperty("thisIs");
    expect(resolved.c1[1].nested).toHaveProperty("thisIs");
  });

  afterAll(async () => {
    await tearDownMemoryDb(mongod, client);
  });
});

describe("stripIds", () => {
  it("ignores non-objects", () => {
    const theValues = [null, "object", 1, 1.4567, Number.NaN, "ಠ_ಠ"];
    for (const v of theValues) {
      expect(stripIds(v)).toBe(v);
    }
  });
  it("walks through arrays", () => {
    const theArray = [
      ["( ͡° ͜ʖ ͡°)╭∩╮", "(╯ ͠° ͟ʖ ͡°)╯┻━┻", "( ͡° ͜ʖ ͡°)"],
      { _id: "blablub" },
      [{ peter: "lustig" }, { _id: "florp", quark: "fettarm" }]
    ];
    const expected = [
      ["( ͡° ͜ʖ ͡°)╭∩╮", "(╯ ͠° ͟ʖ ͡°)╯┻━┻", "( ͡° ͜ʖ ͡°)"],
      {},
      [{ peter: "lustig" }, { quark: "fettarm" }]
    ];
    expect(stripIds(theArray)).toEqual(expected);
  });
  it("walks through objects", () => {
    const theObject = {
      _id: ["( ͡° ͜ʖ ͡°)╭∩╮", "(╯ ͠° ͟ʖ ͡°)╯┻━┻", "( ͡° ͜ʖ ͡°)"],
      diesenrödel: { _id: "blablub" },
      houghjazz: [{ peter: "lustig" }, { _id: "florp", quark: "fettarm" }]
    };
    const expected = {
      diesenrödel: {},
      houghjazz: [{ peter: "lustig" }, { quark: "fettarm" }]
    };
    expect(stripIds(theObject)).toEqual(expected);
  });
});
