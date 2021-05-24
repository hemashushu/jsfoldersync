const path = require('path');
const tmp = require('tmp');
const tmpPromise = require('tmp-promise');
const fse = require('fs-extra');
const fsPromise = require('fs/promises');

const assert = require('assert/strict');

const { ObjectUtils } = require('jsobjectutils');
const { FileInfo, FolderInfo, FileUtils, HashAlgorithm, PromiseFileUtils } = require('jsfileutils');
const { PromiseTextFile } = require('jstextfile');

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

                // 'tempDir' is the target dir
                FolderSync.sync(testResourceDir, tempDir, false, undefined, (err) => {
                    if (err) {
                        fail(err.message);
                        return;
                    }

                    // check the target dir file list
                    FileUtils.listRecursively(tempDir, (err, fileInfos) => {
                        if (err) {
                            fail(err.message);
                            return;
                        }

                        assert.equal(11, fileInfos.length);

                        let targetDirLength = tempDir.length;

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

            tmpPromise.dir()
                .then(({ path: tempDir }) => {
                    _tempDir = tempDir;
                    return PromiseFolderSync.sync(testResourceDir, tempDir);
                })
                .then(() => {
                    return PromiseFileUtils.listRecursively(_tempDir);
                })
                .then(fileInfos => {
                    assert.equal(11, fileInfos.length);

                    let targetDirLength = _tempDir.length;

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

            let fileInfos = await PromiseFileUtils.listRecursively(tempDir);
            assert.equal(11, fileInfos.length);

            await fse.remove(tempDir);
        });
    });

    describe('Test sync with file modified', () => {
        let compareFiles = async (sourceFilePaths, targetFilePaths) => {
            let sourceHashs = [];
            let targetHashs = [];

            for (let sourceFilePath of sourceFilePaths) {
                let sourceHash = await PromiseFileUtils.hashFile(sourceFilePath);
                sourceHashs.push(sourceHash);
            }

            for (let targetFilePath of targetFilePaths) {
                let targetHash = await PromiseFileUtils.hashFile(targetFilePath);
                targetHashs.push(targetHash);
            }

            return ObjectUtils.arrayEquals(sourceHashs, targetHashs);
        };

        it('Test source content change', async () => {
            // build the 'source' folder
            let { path: tempDir1 } = await tmpPromise.dir();
            await PromiseFolderSync.sync(testResourceDir, tempDir1);

            // 通过同步 'source' 文件夹来构建 'target' 文件夹
            let { path: tempDir2 } = await tmpPromise.dir();
            await PromiseFolderSync.sync(tempDir1, tempDir2);

            // 观察 3 个目标文件的变化
            let sourceFile1Path = path.join(tempDir1, 'test1.txt');
            let sourceFile2Path = path.join(tempDir1, 'dir1', 'test1-1.txt');
            let sourceFile3Path = path.join(tempDir1, 'dir1', 'dir3', 'test1-1-1.txt');

            let targetFile1Path = path.join(tempDir2, 'test1.txt');
            let targetFile2Path = path.join(tempDir2, 'dir1', 'test1-1.txt');
            let targetFile3Path = path.join(tempDir2, 'dir1', 'dir3', 'test1-1-1.txt');

            let sourceFilePaths = [sourceFile1Path, sourceFile2Path, sourceFile3Path];
            let targetFilePaths = [targetFile1Path, targetFile2Path, targetFile3Path];

            assert(compareFiles(sourceFilePaths, targetFilePaths));

            // 第 1 次更改源文件内容
            await PromiseTextFile.write(sourceFile1Path, 'change1a');
            await PromiseTextFile.write(sourceFile2Path, 'change2a');

            // 第 1 次同步
            await PromiseFolderSync.sync(tempDir1, tempDir2);
            assert(compareFiles(sourceFilePaths, targetFilePaths));

            // 第 2 次更改源文件内容
            await PromiseTextFile.write(sourceFile2Path, 'change2b');
            await PromiseTextFile.write(sourceFile3Path, 'change3b');

            // 第 2 次同步
            await PromiseFolderSync.sync(tempDir1, tempDir2);
            assert(compareFiles(sourceFilePaths, targetFilePaths));

            await fse.remove(tempDir1);
            await fse.remove(tempDir2);
        });

        it('Test target content change', async () => {
            // build the 'source' folder
            let { path: tempDir1 } = await tmpPromise.dir();
            await PromiseFolderSync.sync(testResourceDir, tempDir1);

            // 通过同步 'source' 文件夹来构建 'target' 文件夹
            let { path: tempDir2 } = await tmpPromise.dir();
            await PromiseFolderSync.sync(tempDir1, tempDir2);

            // 观察 3 个目标文件的变化
            let sourceFile1Path = path.join(tempDir1, 'test1.txt');
            let sourceFile2Path = path.join(tempDir1, 'dir1', 'test1-1.txt');
            let sourceFile3Path = path.join(tempDir1, 'dir1', 'dir3', 'test1-1-1.txt');

            let targetFile1Path = path.join(tempDir2, 'test1.txt');
            let targetFile2Path = path.join(tempDir2, 'dir1', 'test1-1.txt');
            let targetFile3Path = path.join(tempDir2, 'dir1', 'dir3', 'test1-1-1.txt');

            let sourceFilePaths = [sourceFile1Path, sourceFile2Path, sourceFile3Path];
            let targetFilePaths = [targetFile1Path, targetFile2Path, targetFile3Path];

            assert(compareFiles(sourceFilePaths, targetFilePaths));

            // 第 1 次更改目标文件内容
            await PromiseTextFile.write(targetFile1Path, 'change1t');
            await PromiseTextFile.write(targetFile2Path, 'change2t');
            await PromiseTextFile.write(targetFile3Path, 'change3t');

            // 第 1 次同步
            await PromiseFolderSync.sync(tempDir1, tempDir2);
            assert(compareFiles(sourceFilePaths, targetFilePaths));

            // 第 2 次更改目标文件内容
            await PromiseTextFile.write(targetFile1Path, 'change1t2');
            await PromiseTextFile.write(targetFile2Path, 'change2t2');
            await PromiseTextFile.write(targetFile3Path, 'change3t2');

            // 第 2 次同步
            await PromiseFolderSync.sync(tempDir1, tempDir2);
            assert(compareFiles(sourceFilePaths, targetFilePaths));

            await fse.remove(tempDir1);
            await fse.remove(tempDir2);
        });
    });

    describe('Test sync with deleteExtraneous', () => {
        let compareFileTree = async (sourceFolderPath, targetFolderPath) => {
            let sourceFileInfos = await PromiseFileUtils.listRecursively(sourceFolderPath);
            let targetFileInfos = await PromiseFileUtils.listRecursively(targetFolderPath);

            let sourceFileNames = sourceFileInfos
                .map(item => {
                    return item.filePath.substring(sourceFolderPath.length);
                })
                .sort();

            let targetFileNames = targetFileInfos
                .map(item => {
                    return item.filePath.substring(targetFolderPath.length);
                })
                .sort();

            return ObjectUtils.arrayEquals(sourceFileNames, targetFileNames);
        };

        it('Test source folder add/remove files', async () => {
            // build the 'source' and 'target' folder
            let { path: tempDir1 } = await tmpPromise.dir();
            await PromiseFolderSync.sync(testResourceDir, tempDir1);
            let { path: tempDir2 } = await tmpPromise.dir();
            await PromiseFolderSync.sync(tempDir1, tempDir2);

            assert(compareFileTree(tempDir1, tempDir2));

            // 第 1 次修改源文件夹 - 增加文件
            let sourceFile1Path = path.join(tempDir1, 'new1.txt');
            let sourceFile2Path = path.join(tempDir1, 'dir1', 'new1-1.txt');
            await PromiseTextFile.write(sourceFile1Path, 'new1');
            await PromiseTextFile.write(sourceFile2Path, 'new2');

            // 第 1 次同步
            await PromiseFolderSync.sync(tempDir1, tempDir2);
            assert(compareFileTree(tempDir1, tempDir2));

            // 第 2 次修改源文件夹 - 删除文件
            await fsPromise.unlink(sourceFile1Path)
            await fsPromise.unlink(sourceFile2Path);

            // 第 2 次同步
            await PromiseFolderSync.sync(tempDir1, tempDir2);

            let targetFile1Path = path.join(tempDir2, 'new1.txt')
            let targetFile2Path = path.join(tempDir2, 'dir1', 'new1-1.txt')
            let isExistSource1 = await PromiseFileUtils.exists(sourceFile1Path);
            let isExistSource2 = await PromiseFileUtils.exists(sourceFile2Path);
            let isExistTarget1 = await PromiseFileUtils.exists(targetFile1Path);
            let isExistTarget2 = await PromiseFileUtils.exists(targetFile2Path);
            assert(!isExistSource1);
            assert(!isExistSource2);
            assert(isExistTarget1);
            assert(isExistTarget2);

            // 第 3 次同步 - 设置 deleteExtraneous 参数为 true
            await PromiseFolderSync.sync(tempDir1, tempDir2, true);
            let isExistTarget1b = await PromiseFileUtils.exists(targetFile1Path);
            let isExistTarget2b = await PromiseFileUtils.exists(targetFile2Path);
            assert(!isExistTarget1b);
            assert(!isExistTarget2b);
            assert(compareFileTree(tempDir1, tempDir2));

            await fse.remove(tempDir1);
            await fse.remove(tempDir2);
        });

        it('Test target folder add/remove files', async () => {
            // build the 'source' and 'target' folder
            let { path: tempDir1 } = await tmpPromise.dir();
            await PromiseFolderSync.sync(testResourceDir, tempDir1);
            let { path: tempDir2 } = await tmpPromise.dir();
            await PromiseFolderSync.sync(tempDir1, tempDir2);

            assert(compareFileTree(tempDir1, tempDir2));

            // 第 1 次修改目标文件夹 - 删除文件
            let targetFile1Path = path.join(tempDir2, 'test1.txt');
            let targetFile2Path = path.join(tempDir2, 'dir1', 'dir3', 'test1-1-1.txt');

            await fsPromise.unlink(targetFile1Path);
            await fsPromise.unlink(targetFile2Path);

            let isExistTarget1 = await PromiseFileUtils.exists(targetFile1Path);
            let isExistTarget2 = await PromiseFileUtils.exists(targetFile2Path);

            assert(!isExistTarget1);
            assert(!isExistTarget2);

            // 第 1 次同步
            await PromiseFolderSync.sync(tempDir1, tempDir2);
            assert(compareFileTree(tempDir1, tempDir2));

            let isExistTarget1b = await PromiseFileUtils.exists(targetFile1Path);
            let isExistTarget2b = await PromiseFileUtils.exists(targetFile2Path);

            assert(isExistTarget1b);
            assert(isExistTarget2b);

            // 第 1 次修改目标文件夹 - 增加文件
            let targetFile3Path = path.join(tempDir2, 'new1.txt');
            let targetFile4Path = path.join(tempDir2, 'dir1', 'dir3', 'new1-1-1.txt');

            await PromiseTextFile.write(targetFile3Path, 'new1');
            await PromiseTextFile.write(targetFile4Path, 'new1-1-1');

            let isExistTarget3 = await PromiseFileUtils.exists(targetFile3Path);
            let isExistTarget4 = await PromiseFileUtils.exists(targetFile4Path);

            assert(isExistTarget3);
            assert(isExistTarget4);

            // 第 2 次同步
            await PromiseFolderSync.sync(tempDir1, tempDir2);
            let isExistTarget3b = await PromiseFileUtils.exists(targetFile3Path);
            let isExistTarget4b = await PromiseFileUtils.exists(targetFile4Path);

            assert(isExistTarget3b);
            assert(isExistTarget4b);

            // 第 3 次同步 - 设置 deleteExtraneous 参数为 true
            await PromiseFolderSync.sync(tempDir1, tempDir2, true);
            let isExistTarget3c = await PromiseFileUtils.exists(targetFile3Path);
            let isExistTarget4c = await PromiseFileUtils.exists(targetFile4Path);

            assert(!isExistTarget3c);
            assert(!isExistTarget4c);

            assert(compareFileTree(tempDir1, tempDir2));

            await fse.remove(tempDir1);
            await fse.remove(tempDir2);
        });
    });

    describe('Test sync with ignoreFileGlobs', () => {
        let compareFileList = async (sourceFolderPath, fileNamePathList) => {
            let sourceFileInfos = await PromiseFileUtils.listRecursively(sourceFolderPath);

            let sourceFileNames = sourceFileInfos
                .map(item => {
                    return item.filePath.substring(sourceFolderPath.length);
                })
                .sort();

            return ObjectUtils.arrayEquals(sourceFileNames, fileNamePathList);
        };

        it('Test ignoreFileGlobs list 1 - glob by extension name', async () => {
            // build the 'source' and 'target' folder
            let { path: tempDir1 } = await tmpPromise.dir();
            await PromiseFolderSync.sync(testResourceDir, tempDir1);

            // 源文件目录：
            // [
            //     '/dir1',
            //     '/dir1/dir3',
            //     '/dir1/dir3/test1-1-1.txt',
            //     '/dir1/dir3/test1-1-2.txt',
            //     '/dir1/test1-1.txt',
            //     '/dir1/test1-2.md',
            //     '/dir2',
            //     '/dir2/test2-1.txt',
            //     '/test1.txt',
            //     '/test2.txt',
            //     '/test3.md'
            // ]

            let { path: tempDir2 } = await tmpPromise.dir();
            await PromiseFolderSync.sync(tempDir1, tempDir2, false, [
                '*.txt'
            ]);

            let c1 = compareFileList(tempDir2, ['/dir1', '/dir1/dir3', '/dir1/test1-2.md', '/dir2', '/test3.md']);
            assert(c1);

            await fse.remove(tempDir1);
            await fse.remove(tempDir2);
        });

        it('Test ignoreFileGlobs list 2 - glob by dir name', async () => {
            // build the 'source' and 'target' folder
            let { path: tempDir1 } = await tmpPromise.dir();
            await PromiseFolderSync.sync(testResourceDir, tempDir1);

            // 源文件目录：
            // [
            //     '/dir1',
            //     '/dir1/dir3',
            //     '/dir1/dir3/test1-1-1.txt',
            //     '/dir1/dir3/test1-1-2.txt',
            //     '/dir1/test1-1.txt',
            //     '/dir1/test1-2.md',
            //     '/dir2',
            //     '/dir2/test2-1.txt',
            //     '/test1.txt',
            //     '/test2.txt',
            //     '/test3.md'
            // ]

            let { path: tempDir2 } = await tmpPromise.dir();
            await PromiseFolderSync.sync(tempDir1, tempDir2, false, [
                'dir2',
                'dir3',
                '*.md'
            ]);

            let c1 = compareFileList(tempDir2, ['/dir1', '/dir1/test1-1.txt', '/test1.txt', '/test2.txt']);
            assert(c1);

            await fse.remove(tempDir1);
            await fse.remove(tempDir2);
        });

        it('Test ignoreFileGlobs list 3 - glob by path', async () => {
            // build the 'source' and 'target' folder
            let { path: tempDir1 } = await tmpPromise.dir();
            await PromiseFolderSync.sync(testResourceDir, tempDir1);

            // 源文件目录：
            // [
            //     '/dir1',
            //     '/dir1/dir3',
            //     '/dir1/dir3/test1-1-1.txt',
            //     '/dir1/dir3/test1-1-2.txt',
            //     '/dir1/test1-1.txt',
            //     '/dir1/test1-2.md',
            //     '/dir2',
            //     '/dir2/test2-1.txt',
            //     '/test1.txt',
            //     '/test2.txt',
            //     '/test3.md'
            // ]

            let { path: tempDir2 } = await tmpPromise.dir();
            await PromiseFolderSync.sync(tempDir1, tempDir2, false, [
                '/*.md',
                '/dir3', // 应该不起作用
                '/dir1/**/*.md',
                '/dir1/dir3/test?.txt', // 应该不起作用
                '/dir1/dir3/test1-1-1.txt'
            ]);

            let c1 = compareFileList(tempDir2, [
                '/dir1',
                '/dir1/dir3',
                '/dir1/dir3/test1-1-2.txt',
                '/dir1/test1-1.txt',
                '/dir2',
                '/dir2/test2-1.txt',
                '/test1.txt',
                '/test2.txt'
            ]);

            assert(c1);

            await fse.remove(tempDir1);
            await fse.remove(tempDir2);
        });

    });

});