# JS Mongodb Utilities

A collection of some small utility functions for easier interaction with the node.js [mongodb driver](https://www.npmjs.com/package/mongodb).

Contains a small helper that connects to a database and some helpers that resolve references between documents.

```
npm install @yeldirium/js-mongodb-utilities
# or
yarn install @yeldirium/js-mongodb-utilities
```

## Status

| Category         | Status                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Version          | [![npm](https://img.shields.io/npm/v/@yeldirium/js-mongodb-utilities)](https://www.npmjs.com/package/@yeldirium/js-mongodb-utilities) |
| Dependencies     | ![David](https://img.shields.io/david/yeldirium/js-mongodb-utilities)                                                                 |
| Dev dependencies | ![David](https://img.shields.io/david/dev/yeldirium/js-mongodb-utilities)                                                             |
| Build            | ![GitHub Actions](https://github.com/yeldiRium/js-mongodb-utilities/workflows/Release/badge.svg?branch=master)                        |
| License          | ![GitHub](https://img.shields.io/github/license/yeldiRium/js-mongodb-utilities)                                                       |

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

Then `resolve` can make your life easier by fetching
the referenced documents for you in a controlled way using a list of allowed
target collections and a maximum depth.

# extractInsertedIdsFromMongoDBResult

Get the ids of created documents without having to look in the object yourself.

# stripIds

String all mongodb document `_id`s from a document recursively. Useful, if you
want to serve some documents from the database via an API but don't want to
expose the internal ids.
