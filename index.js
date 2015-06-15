// built-in node modules
var fs = require('fs');
var path = require('path');

// npm modules
var _ = require('lodash');
var ejs = require('ejs');
var mkdirp = require('mkdirp');
var Bfy = require('browserify');
var marked = require('marked');
var concat = require('concat-stream');
var debug = require('debug')('bpm-bundle');

var template = require.resolve('./bundle.ejs');
template = fs.readFileSync(template, 'utf-8');

exports.bundle = function(config, opts, repoDir, bundleDir, cb) {
    debug(require('./package.json').version);
    debug('about to bundle episode at ' + repoDir);
    // load package.json
    var package_json_path = path.join(repoDir, 'package.json');
    var pkg = null;
    try {
        pkg = JSON.parse(fs.readFileSync(package_json_path, 'utf-8'));
    } catch(e) {
        debug('unable to read package.json');
        return cb(e);
    }
    if (typeof(pkg.brain) === 'undefined') {
        pkg.brain = {};
    }

    var markdown_path = findContentMarkDown(pkg, repoDir);
    if (markdown_path === null) {
        return cb(new Error('unable to find markdown file'));
    }

    var html = renderHTML(pkg, markdown_path);

    applyTransforms(pkg, repoDir, html, htmlReady);

    function htmlReady(err, html) {
        if (err) return cb(err);
        var code = renderTemplate(template, repoDir, pkg, html);

        mkdirp(bundleDir, function(err) {
            if (err) return cb(err);

            runBrowserify(code, bundleDir, function(err) {
                if (err) {
                    debug(err.message);
                } else {
                    debug('done bundling ' + pkg.name);
                }
                return cb(err);
                //write bundler name and version to episode's package.JSON
                /*
                TODO: We mustn't touch the original package.json,
                since it is part of the source code. Doing so will cause
                the git working directory to be unclean after bundling and that's
                suprising and annoying to users.
                Instead we should manipulate a *copy* of package.json immediatley prior
                to browserifying (could also be a browserify transform).

                var bundler = require('./package.json');
                pkg.brain.bundler = {name: bundler.name, version: bundler.version};
                fs.writeFile(package_json_path, JSON.stringify(pkg, null, 4), function(err){
                    cb(err);
                });
                */
            });
        });
    }
};

function findContentMarkDown(pkg, repoDir) {
    var filenames = [pkg.brain.content || 'content.md', 'readme.md', 'ReadMe.md', 'README.md'];
    for(var i=0; i<filenames.length; ++i) {
        var p = path.join(repoDir, filenames[i]);
        try {
            fs.statSync(p);
            return p;
        } catch(e) {}
    }
    return null;
}

function renderHTML(pkg, markdown_path) {
    var markDown = fs.readFileSync(markdown_path, 'utf8');
    var myRenderer = new marked.Renderer();

    //prefix anchor tags in headlines with episode name to disambiguate
    myRenderer.heading = function (text, level) {
        var escapedText = pkg.name + '_' + text.toLowerCase().replace(/[^\w]+/g, '-');
        return '<h' + level + '><a name="' +
            escapedText +
            '" class="anchor" href="#' +
            escapedText +
            '"><span class="header-link"></span></a>' +
            text + '</h' + level + '>';
    };

    marked.setOptions({
          renderer: myRenderer,
          gfm: true,
          tables: true,
          breaks: true,
          pedantic: false,
          sanitize: false,
          smartLists: true,
          smartypants: true
    });

    var html = marked(markDown);
    return html;
}

function runBrowserify(code, bundleDir, cb) {
    var bfy = Bfy();
    var indexPath = path.join(bundleDir, '_index.js');
    var outPath = path.join(bundleDir, 'index.js');

    debug('writing rendered ejs template to ' + indexPath);
    fs.writeFileSync(indexPath, code, 'utf-8');

    // browserify _index.js
    bfy.add(indexPath);
    bfy.transform(require.resolve('cssify'), {global: true});

    var stream = bfy.bundle();
    stream.on('error', function(err) {
        cb(new Error('error while browserify.bundle:'+ err.message));
    });
    stream.on('end', function() {
        fs.unlinkSync(indexPath);
        cb(null);
    });
    stream.pipe(fs.createWriteStream(outPath));
}

function applyTransforms (pkg, repoDir, html, cb) {
    var transforms = pkg.brain['content-transform'] || [];
    if (transforms.length) {
        transforms = _.map(transforms, function(t) {
            var tp = path.join(repoDir, 'node_modules', t);
            tp = path.resolve(tp);
            debug('try to require transform module at '+ tp);
            return require(tp)();
        });
        var combined = _.reduce(transforms, function(combined, n) {
            return combined.pipe(n);
        });

        var cs = concat(function(html) {
            cb(null, html);
        });
        combined.on('error', function(err) {
            cb(new Error('error while content-transform:'+ error.message));
        });
        combined.pipe(cs);
        combined.write(html);
        combined.end();
    } else {
        cb(null, html);
    }
}

function renderTemplate(template, repoDir, pkg, html) {
    var ctx = {
        cwd: repoDir,
        content: html,
        pkg: pkg
    };
    return ejs.render(template, ctx);
}
