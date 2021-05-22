const path = require('path');
const tmp = require('tmp');
const tmpPromise = require('tmp-promise');
const fse = require('fs-extra');
const fsPromise = require('fs/promises');

const assert = require('assert/strict');

const { ObjectUtils } = require('jsobjectutils');
const { FileInfo, FolderInfo, FileUtils, HashAlgorithm, PromiseFileUtils } = require('jsfileutils');

const { FolderSync, PromiseFolderSync } = require('../index');

const testDir = __dirname;
const testResourceFolderName = 'resource';
const testResourceDir = path.join(testDir, testResourceFolderName);

describe('Test sync', () => {

    describe('Test base sync', () => {
        it('Test base sync - callback', (done) => {
            // sync 'resource' folder to temp dir

            tmp.dir((err, tempDir) => {
                if (err) {
                    fail(err.message);
                    return;
                }

                FolderSync.sync(testResourceDir, tempDir, false, undefined, (err) => {
                    if (err) {
                        fail(err.message);
                        return;
                    }

                    // check the target dir file list
                    let targetDir = path.join(tempDir, testResourceFolderName);
                    FileUtils.listRecursively(targetDir, (err, fileInfos) => {
                        if (err) {
                            fail(err.message);
                            return;
                        }

                        assert.equal(11, fileInfos.length);

                        let targetDirLength = targetDir.length;

                        let names = fileInfos
                            .map(item => {
                                return item.filePath.substring(targetDirLength);
                            })
                            .sort();

                        assert(ObjectUtils.arrayEquals(names,
                            [
                                '/dir1',
                                '/dir1/dir3',
                                '/dir1/dir3/test1-1-1.txt',
                                '/dir1/dir3/test1-1-2.txt',
                                '/dir1/test1-1.txt',
                                '/dir1/test1-2.md',
                                '/dir2',
                                '/dir2/test2-1.txt',
                                '/test1.txt',
                                '/test2.txt',
                                '/test3.md'
                            ]
                        ));

                        fse.remove(tempDir, () => {
                            done();
                        });
                    });
                });
            });
        });

        it('Test base sync - Promise', (done) => {
            let _tempDir;
            let _targetDir;

            tmpPromise.dir()
                .then(({ path: tempDir }) => {
                    _tempDir = tempDir;
                    return PromiseFolderSync.sync(testResourceDir, tempDir);
                })
                .then(() => {
                    let targetDir = path.join(_tempDir, testResourceFolderName);
                    _targetDir = targetDir;
                    return PromiseFileUtils.listRecursively(targetDir);
                })
                .then(fileInfos => {
                    assert.equal(11, fileInfos.length);

                    let targetDirLength = _targetDir.length;

                    let names = fileInfos
                        .map(item => {
                            return item.filePath.substring(targetDirLength);
                        })
                        .sort();

                    assert(ObjectUtils.arrayEquals(names,
                        [
                            '/dir1',
                            '/dir1/dir3',
                            '/dir1/dir3/test1-1-1.txt',
                            '/dir1/dir3/test1-1-2.txt',
                            '/dir1/test1-1.txt',
                            '/dir1/test1-2.md',
                            '/dir2',
                            '/dir2/test2-1.txt',
                            '/test1.txt',
                            '/test2.txt',
                            '/test3.md'
                        ]
                    ));
                })
                .then(() => fse.remove(_tempDir))
                .then(() => {
                    done();
                });

        });

        it('Test base sync - await', async () => {
            let { path: tempDir } = await tmpPromise.dir();
            await PromiseFolderSync.sync(testResourceDir, tempDir);

            let targetDir = path.join(tempDir, testResourceFolderName);
            let fileInfos = await PromiseFileUtils.listRecursively(targetDir);
            assert.equal(11, fileInfos.length);

            await fse.remove(tempDir);
        });
    });

    describe('Test sync with file modified', () => { });

    describe('Test sync with deleteExtraneous', () => { });

    describe('Test sync with ignoreFileGlobs', () => { });

});