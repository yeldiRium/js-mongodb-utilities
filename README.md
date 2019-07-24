# JS Mongodb Utilities

[![Build Status](https://travis-ci.org/yeldiRium/js-mongodb-utilities.svg?branch=master)](https://travis-ci.org/yeldiRium/js-mongodb-utilities)
[![npm version](http://img.shields.io/npm/v/@yeldirium/js-mongodb-utilities.svg?style=flat)](https://npmjs.org/package/@yeldirium/js-mongodb-utilities "View this project on npm")

A collection of some small utility functions for easier interaction with the node.js [mongodb driver](https://www.npmjs.com/package/mongodb).

Contains a small helper that connects to a database and some helpers that resolve references between documents.

```
npm install @yeldirium/js-mongodb-utilities
```

# DbRef

A DbRef as defined by the utilities must match this schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema",
  "title": "DBRef",
  "description": "A reference to an _id of another document",
  "type": "object",
  "properties": {
    "collection": {
      "description": "The collection the referenced object resides in",
      "type": "string"
    },
    "id": {
      "type": "string"
    }
  },
  "required": ["collection", "id"]
}
```

Where the value of `collection` must be the name of an existing collection and
`id` must be the mongodb document `_id` of a document in said collection.

Then `resolveDbRef` and `resolveDbRefs` can make your life easier by fetching
the referenced documents for you in a controlled way using a list of allowed
target collections and a maximum depth.

# extractInsertedIdsFromMongoDBResult

Get the ids of created documents without having to look in the object yourself.

# stripIds

String all mongodb document `_id`s from a document recursively. Useful, if you
want to serve some documents from the database via an API but don't want to
expose the internal ids.
