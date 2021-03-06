/*
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

const acorn = require('acorn');
const walk = require('acorn/dist/walk');
const fs = require('fs');
const path = require('path');

const options = {
  sourceType: 'module',
};

/**
 * @param {string} target
 * @return {!Promise<string>}
 */
function readFile(target) {
  return new Promise((resolve, reject) => {
    fs.readFile(target, 'utf8', (err, data) => err ? reject(err) : resolve(data));
  });
}

/**
 * @param {string}
 * @return {string}
 */
function localResolve(src) {
  if (!src.startsWith('./')) {
    return './' + src;
  }
  return src;
}

/**
 * @param {string|!Promise<string>} target
 * @return {!Promise<!Array<string>>} return the direct deps of this file
 */
function importsForFile(target) {
  return readFile(target).then((data) => {
    const dir = path.dirname(target);

    const s = new Set();
    walk.simple(acorn.parse(data, options), {
      ImportDeclaration(node) {
        const other = node.source.value;

        if (!other.startsWith('./') && !other.startsWith('../')) {
          // TODO: unsupported import type
          return;
        }

        const out = localResolve(path.join(dir, other));
        if (out !== target) {
          s.add(out);
        }
      }
    });

    return [...s];
  });
}

/**
 * Reads JS source files and returns a Map of their direct dependencies.
 *
 * @param {!Array<string>} entrypoints
 * @return {!Map<string, !Array<string>>}
 */
module.exports = function(entrypoints) {
  const all = new Map();
  const pending = new Set();

  return new Promise((resolve, reject) => {
    const maybeResolve = (target) => {
      pending.delete(target);
      pending.size || resolve(all);
    };

    const push = (target) => {
      if (all.has(target)) {
        return null;
      }
      all.set(target, null);
      pending.add(target);

      return importsForFile(target)
          .then((imports) => {
            all.set(target, imports);
            imports.forEach(push);
            maybeResolve(target);
          })
          .catch(reject);
    };

    entrypoints.forEach(push);
  });
};
