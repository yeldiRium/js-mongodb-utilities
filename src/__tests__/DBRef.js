const R = require("ramda");
const { ObjectID } = require("mongodb");
const {
  randomDbRefs,
  randomArrayOf,
  randomArray,
  randomArrayBy,
  randomObjectOfTypes,
  VALUE_TYPES,
  OBJECT_TYPES,
  randomDocument
} = require("zufall");

const {
  isLeaf,
  isInnerNode,
  isDbRef,
  children,
  shouldResolve,
  resolve
} = require("../DbRef");

describe("The predicate isDbRef()", () => {
  it("matches a DBRef", () => {
    for (const dbref of randomDbRefs(128)) {
      expect(isDbRef(dbref)).toBe(true);
    }
  });
  it("does not match random objects", () => {
    for (const o of randomArrayOf("Object", 128)) {
      expect(isDbRef(o)).toBe(false);
    }
  });
});

describe("The predicate isLeaf()", () => {
  it("matches value-type things", () => {
    for (const type of VALUE_TYPES) {
      for (const value of randomArrayOf(type)) {
        expect(isLeaf(value)).toBe(true);
      }
    }
  });
  it("does not match object-type things", () => {
    for (const type of OBJECT_TYPES) {
      for (const value of randomArrayOf(type)) {
        expect(isLeaf(value)).toBe(false);
      }
    }
  });
});

describe("The predication isInnerNode()", () => {
  const randomNode = (n = 16) =>
    randomObjectOfTypes(["Object", ...VALUE_TYPES], n);

  const randomNodes = (n = 16, m = 16) => randomArrayBy(() => randomNode(m), n);

  it("matches random nodes", () => {
    for (const node of randomNodes(128)) {
      expect(isInnerNode(node)).toBe(true);
    }
  });

  it("does not match value-type things", () => {
    for (const o of randomArray()) {
      expect(isInnerNode(o)).toBe(false);
    }
  });
});

describe("The function children()", () => {
  it("returns all child nodes of a node", () => {
    const cases = [
      // Cases for Object
      { node: { a: 2, b: 4 }, childKeys: [] },
      { node: { a: [2, 3, 5], b: 4 }, childKeys: ["a"] },
      { node: { a: 2, b: { c: 3 } }, childKeys: ["b"] },
      { node: { a: "f", b: 4 }, childKeys: [] },
      { node: { a: null, b: 4 }, childKeys: [] },
      { node: { a: undefined, b: NaN }, childKeys: [] },
      { node: { a: 2, b: { c: { d: { e: 2 } } } }, childKeys: ["b"] },
      // Cases for Array
      { node: [2, 4], childKeys: [] },
      { node: [[2, 3, 5], 4], childKeys: [0] },
      { node: [2, { c: 3 }], childKeys: [1] },
      { node: ["f", 4], childKeys: [] },
      { node: [null, 4], childKeys: [] },
      { node: [undefined, NaN], childKeys: [] },
      { node: [2, { c: { d: { e: 2 } } }], childKeys: [1] }
    ];
    for (const { node, childKeys } of cases) {
      // [{child: ... , key: "bla"}]
      const expectedKeys = new Set(childKeys);
      const actualKeys = new Set(R.map(R.prop("key"), children(node)));
      expect(actualKeys).toEqual(expectedKeys);
    }
  });

  it("throws when the input is not a node", () => {
    for (const value of randomArray()) {
      expect(() => {
        children(value);
      }).toThrow();
    }
  });
});

describe("The predicate shouldResolve()", () => {
  it("matches valid cases", () => {
    for (let i = 0; i < 10; i++) {
      const { root, dbrefs, collections } = randomDocument(4);
      for (const [path, node] of dbrefs.entries()) {
        expect(shouldResolve(root, path, collections, node)).toBe(true);
      }
    }
  });

  it("ignores a cycle", () => {
    const theId = new ObjectID();
    const thePath = ["foo", "baz", "quux", "murx"];
    const theCollections = ["mlem"];
    const document = {
      foo: {
        baz: {
          _id: theId,
          quux: {
            murx: {
              id: theId.toString(),
              collection: "mlem"
            }
          }
        }
      },
      bar: {
        blorp: [1, 2, 4]
      }
    };
    expect(
      shouldResolve(
        document,
        thePath,
        theCollections,
        R.path(thePath, document)
      )
    ).toBe(false);
  });

  it("ignores collections not listed in collections argument", () => {
    const theId = new ObjectID();
    const thePath = ["foo", "baz", "quux", "murx"];
    const theCollections = [];
    const document = {
      foo: {
        baz: {
          quux: {
            murx: {
              id: theId.toString(),
              collection: "mlem"
            }
          }
        }
      },
      bar: {
        blorp: [1, 2, 4]
      }
    };
    expect(
      shouldResolve(
        document,
        thePath,
        theCollections,
        R.path(thePath, document)
      )
    ).toBe(false);
  });

  it("doesn't ignore collections when collections argument is null", () => {
    const theId = new ObjectID();
    const thePath = ["foo", "baz", "quux", "murx"];
    const theCollections = null;
    const document = {
      foo: {
        baz: {
          quux: {
            murx: {
              id: theId.toString(),
              collection: "mlem"
            }
          }
        }
      },
      bar: {
        blorp: [1, 2, 4]
      }
    };
    expect(
      shouldResolve(
        document,
        thePath,
        theCollections,
        R.path(thePath, document)
      )
    ).toBe(true);
  });
});

describe("The function resolve()", () => {
  it("resolves a document by calling the supplied function", async () => {
    const dummyResolve = jest.fn(async (_, { id, collection }) => ({
      resolved: true,
      _id: new ObjectID(id),
      collection
    }));
    const testResolve = resolve(dummyResolve);

    let numberOfDbRefs = 0;
    for (let i = 0; i < 10; i++) {
      const { root, dbrefs, collections } = randomDocument(4);
      numberOfDbRefs += dbrefs.size;
      const resolved = await testResolve(null, root, collections);
      for (const [path, dbref] of dbrefs.entries()) {
        expect(R.path(path, resolved)).toEqual(await dummyResolve(null, dbref));
      }
    }
    expect(dummyResolve).toHaveBeenCalledTimes(2 * numberOfDbRefs);
  });

  it("memoizes resolved documents to reduce db operations", async () => {
    const dummyResolve = jest.fn(async (_, { id, collection }) => ({
      resolved: true,
      _id: new ObjectID(id),
      collection
    }));
    const testResolve = resolve(dummyResolve);
    const id1 = new ObjectID();
    const id2 = new ObjectID();
    const id3 = new ObjectID();
    const document = {
      ref1a: {
        id: id1.toString(),
        collection: "bla"
      },
      ref1b: {
        id: id1.toString(),
        collection: "bla"
      },
      ref1c: {
        id: id1.toString(),
        collection: "bla"
      },
      foo: {
        ref2a: {
          id: id2.toString(),
          collection: "bla"
        },
        bar: {
          ref2b: {
            id: id2.toString(),
            collection: "bla"
          },
          baz: {
            ref3a: {
              id: id3.toString(),
              collection: "bla"
            }
          }
        }
      }
    };
    await testResolve(null, document);
    expect(dummyResolve).toHaveBeenCalledTimes(3);
  });

  it("does not resolve beyond the given depth", async () => {
    // we build an endlessly nested dbref here, this will resolve
    // endlessly without a maximum depth
    const dummyResolve = jest.fn(async (_, { collection }) => ({
      recursion: {
        id: new ObjectID().toString(),
        collection
      }
    }));
    const testResolve = resolve(dummyResolve);
    const document = {
      a: {
        b: { c: { d: { id: new ObjectID().toString(), collection: "bla" } } }
      }
    };
    const maxDepth = 5;
    await testResolve(null, document, null, maxDepth);
    expect(dummyResolve).toHaveBeenCalledTimes(maxDepth);
  });
});
