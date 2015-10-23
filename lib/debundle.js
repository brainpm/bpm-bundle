var concat = require('concat-stream');

module.exports.getMetaData = function(retrieval, cb) {
    retrieval.getFileStream('package.json').pipe(concat(function(json) {
        var data = null;
        try {
            data = JSON.parse(json);
        } catch(e) {
            var err = new Error('Failed parse package.json of episode ' + retrieval.name);
            return cb(err);
        }
        cb(null, data);
    }));
};

module.exports.getContent = function(retrieval) {
    // TODO: extract from web-player
}

