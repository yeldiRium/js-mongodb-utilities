/**
 * Module for operations on mongodb documents
 * containing DbRefs.
 *
 * Throughout this module, we'll be thinking of the
 * document as a tree, hence the naming of
 * `children()`, `isInnerNode()`, `isLeaf()`, etc.
 */

const R = require("ramda");
const { ObjectID } = require("mongodb");

/**
 * Predicate to check if a given value is a DbRef object.
 *
 * This library uses the following format:
 * ```
 * {
 *   "collection": "nameOfACollection",
 *   "id": "documentIdInStringForm"
 * }
 * ```
 *
 * @param {*} value
 * @returns {boolean}
 */
const isDbRef = R.allPass([R.is(Object), R.has("collection"), R.has("id")]);

/**
 * Predicate to check if a given value is a inner tree node,
 * i.e. an Array or Object since these can be nested to create
 * a tree-like structure.
 *
 * @param {*} value
 * @returns {boolean}
 */
const isInnerNode = R.anyPass([R.is(Array), R.is(Object)]);
const isLeaf = R.complement(isInnerNode);

/**
 * Returns the child nodes of a inner tree node that
 * are themselves inner nodes. We may disregard leaf
 * nodes, as they can't be DbRefs.
 *
 * @param {*} parentNode
 * @returns {Array<Object>} Array of `{key, node}` where `key` is the key of `node` in `parentNode`
 */
function children(node) {
  if (isLeaf(node)) {
    throw Error("Leafs do not have children!");
  }
  const isArray = R.is(Array, node);
  return R.pipe(
    R.map(([key, node]) => ({
      // since `R.assocPath()` will convert an Array into an
      // object, if the corresponding path element is a string,
      // we have to convert the key into an integer if the node
      // is an Array.
      key: isArray ? Number.parseInt(key) : key,
      node,
    })),
    R.filter(({ node }) => isInnerNode(node))
  )(Object.entries(node));
}

/**
 * Helper function to check if a DbRef at a given `path` in `root`
 * should be resolved according to the `collections` and `maxDepth` arguments.
 * It also walks the path from `root` to the DbRef to detect reference cycles.
 *
 * @param {Object} root
 * @param {Array<string>} path
 * @param {Array<string>} collections
 * @param {Object} dbref
 * @returns {boolean}
 */
const shouldResolve = (root, path, collections, { id, collection }) => {
  if (!R.isNil(collections) && !collections.includes(collection)) return false;
  const refId = new ObjectID(id);
  let iNode = root;
  for (const key of path) {
    if (R.has("_id", iNode) && refId.equals(iNode._id)) return false;
    iNode = iNode[key];
  }
  return true;
};

/**
 * Resolve is a factory for a breadth-first traversal of DBRef relationships.
 * It will resolve each DBRef only once by calling the supplied
 * `resolveDbRef` function with the datababase handle and
 * the dbref to resolve.
 * @param {*} resolveDbRef A function receiving `db` and a dbref object to resolve and fetches it from the database.
 * @returns {*} A function able to resolve DbRefs in a given document
 */
const resolve = (resolveDbRef) => async (
  db,
  document,
  collections = null,
  maxDepth = Infinity
) => {
  if (isLeaf(document)) {
    throw Error(
      `Invalid document type: ${typeof document}. Expected Arrays or Object.`
    );
  }

  // We memorize the path from the root for each vertex so that we can
  //   A) insert a resolved document into the return value
  //      at the correct position
  //   B) recognize cycles and eventually terminate
  const q = [{ node: document, depth: 0, path: [] }]; // new queue
  const memo = {}; // memorize all resolved documents
  let resolved = R.clone(document); // return value

  while (q.length > 0) {
    let next = q.shift(); // queue.pop()
    let node = next.node;
    let depth = next.depth;
    let path = next.path;

    if (depth >= maxDepth) {
      continue;
    }
    if (isDbRef(node) && shouldResolve(resolved, path, collections, node)) {
      // check if the DBRef has been resolved before
      let { id } = node;
      let memorized = memo[id];
      if (!R.isNil(memorized)) {
        node = memorized;
      } else {
        memo[id] = node = await resolveDbRef(db, node);
      }
      // insert the resolved document into the return value
      resolved = R.assocPath(path, node, resolved);
      depth++;
    }
    for (const child of children(node)) {
      // enqueue all child vertices of the current node
      q.push({
        node: child.node,
        depth,
        path: [...path, child.key],
      });
    }
  }
  return resolved;
};

module.exports = {
  isDbRef,
  isLeaf,
  isInnerNode,
  children,
  shouldResolve,
  resolve,
};
