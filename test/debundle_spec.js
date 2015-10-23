var test = require('tape');
var from = require('from');
var getMetaData = require('../lib/debundle.js').getMetaData;

test('parses valid JSON', function(t) {
    var data = {
        bla: 'blubb',
        foo: 'bar'
    };
    function mockGetFileStream() {
        return from(JSON.stringify(data).split(''));
    }
    getMetaData({
            getFileStream: mockGetFileStream
        }, 
        function( err, parsedData) {
            t.error(err);
            t.deepEqual(parsedData, data);
            t.end();
        }
    );
});

test('calls callback with error when parsing does not work', function(t) {
    function mockGetFileStream() {
        return from("{I am SOO invalid".split(''));
    }
    getMetaData({
            getFileStream: mockGetFileStream
        }, 
        function( err, parsedData) {
            t.ok(err);
            t.notOk(parsedData);
            t.end();
        }
    );
});
