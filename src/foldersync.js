const path = require('path');

const fse = require('fs-extra');
const minimatch = require('minimatch');
const { FileUtils, FolderInfo, HashAlgorithm } = require('jsfileutils');

/**
 * （单向）同步两个文件夹。
 *
 * 实现将一个源文件夹的内容（即文件和子文件夹）同步到目标文件夹，最终得到跟源文件夹内容
 * 一致的目标文件夹。
 *
 * - 同步是单向的，即目标文件夹会更新至跟源文件夹一致，但源文件夹的内容不会受目标文件夹
 *   的内容而发生任何改变；
 * - 仅当文件的内容不相同时才进行同步，文件的时间或者属性（比如 owner、访问权限）改变
 *   不会同步；
 *
 */
class FolderSync {

    /**
     * 单向同步两个文件夹
     *
     * - 当目标文件夹不存在时，会自动被创建
     * - 通过设置 deleteExtraneous 参数为 true，可以删除目标文件夹比源文件夹多出来的
     *   内容（即文件和子文件夹）
     * - 设置 ignoreFileGlobs 参数可以忽略源文件夹的部分内容。
     *
     * @param {*} sourceFolderPath 源文件夹的路径
     * @param {*} destDirectory 目标位置，不包括源文件夹名称，即
     *     最终目标文件夹将会是 'destDirectory + basename(sourceFolderPath)'
     * @param {*} deleteExtraneous boolean 值，是否删除目标文件夹里比源文件夹多出来的内容
     * @param {*} ignoreFileGlobs 字符串数组，一个用于忽略部分源文件的模式（pattern）列表。
     *     简单示例：
     *
     *     - frotz       # 忽略所有名字为 frotz 的文件或文件夹，
     *       不管它在哪一层目录，即既会忽略 ./frotz 也会忽略 ./a/frotz
     *     - frotz/      # 表示一个文件夹名称，末尾的 “/” 表示这是一个文件夹，而不是文件。
     *       不管它在哪一层目录，即既会忽略 ./frotz/ 也会忽略 ./a/frotz/
     *     - *.jpg       # 星号表示 1 个或多个字符，忽略所有 .jpg 扩展名的文件
     *     - backup?.dat # 问号表示 1 个字符，忽略所有 "backup" 开头，后面连接 1 个字符的 ".dat" 文件
     *     - bak[0-9a-z] # 中括号表示指定范围内的任一字符，忽略 bak0，不忽略 bakA
     *
     *     - /doc/frotz  # 表示具体路径的一个文件或文件夹
     *       忽略 ./doc/frotz 文件或文件夹，但不会忽略 ./a/doc/frotz 文件或文件夹
     *     - doc/frotz   # 表示具体路径的一个文件或文件夹，作用同上
     *       只要模式中间出现了 “/”，则模式**不**表示相对路径，而是具体的路径
     *     - doc/frotz/  # 表示具体路径的一个文件夹，末尾的 “/” 表示这是一个文件夹，而不是文件
     *     - /backup.*   # 忽略第一层文件夹里所有名字为 backup （无视扩展名）的文件
     *     - abc/**      # 忽略 ./abc/ 之下的所有内容，作用同模式 /abc/
     *       当以 “**” 结尾时，则模式**不**表示相对路径，而是具体的路径
     *     - **\abc      # 忽略所有层里名字为 abc 的文件或文件夹，作用同模式 “abc”
     *       注：因为此段文字在注释之内，所以第二个斜线写成了反斜线
     *     - a/**\b      # 忽略 0 或 多层中间文件夹，忽略 a/b
     *       a/x/b, a/x/y/b 等文件或文件夹
     *       注：因为此段文字在注释之内，所以第二个斜线写成了反斜线
     *
     *     格式请参考 gitignore:
     *     https://git-scm.com/docs/gitignore
     *     https://github.com/isaacs/minimatch
     * @param {*} callback 回调返回 (err)
     */
    static sync(sourceFolderPath, destDirectory, deleteExtraneous, ignoreFileGlobs, callback) {
        let sourceDirectory = path.dirname(sourceFolderPath);
        let folderName = path.basename(sourceFolderPath);
        let internalFolderPath = path.join('/', folderName);

        FolderSync._syncFolder(sourceDirectory, destDirectory,
            deleteExtraneous, ignoreFileGlobs, internalFolderPath, (err) => {
                if (err) {
                    callback(err);
                    return;
                }

                callback();
            });
    }

    static _syncFolder(sourceDirectory, destDirectory, deleteExtraneous, ignoreFileGlobs, internalFolderPath, callback) {

        // 'internalFolderPath' 是内部使用的变量，表示当前正在同步的文件夹路径（相对 sourceDirectory 来说）
        // 必须以 '/' 字符开头，比如 '/foo'， '/foo/bar'

        let processUpdateFolders = (toBeAddedFolderNames) => {
            if (toBeAddedFolderNames.length === 0) {
                callback();
                return;
            }

            let folderName = toBeAddedFolderNames.pop();
            let subFolderPath = path.join(internalFolderPath, folderName);

            FolderSync._syncFolder(sourceDirectory, destDirectory, deleteExtraneous, ignoreFileGlobs, subFolderPath, (err) => {
                if (err) {
                    callback(err);
                    return;
                }

                processUpdateFolders(toBeAddedFolderNames);
            });
        };

        let processUpdateFiles = (toBeAddedFileNames, toBeAddedFolderNames) => {
            if (toBeAddedFileNames.length === 0) {
                processUpdateFolders(toBeAddedFolderNames);
                return;
            }

            let sourceFolderPath = path.join(sourceDirectory, internalFolderPath);
            let destFolderPath = path.join(destDirectory, internalFolderPath);

            FolderSync._updateFiles(sourceFolderPath, destFolderPath, toBeAddedFileNames, (err) => {
                if (err) {
                    callback(err);
                    return;
                }

                processUpdateFolders(toBeAddedFolderNames);
            });
        };

        let processRemove = (toBeRemovedNames, toBeAddedFileNames, toBeAddedFolderNames) => {
            if (toBeRemovedNames.length === 0) {
                processUpdateFiles(toBeAddedFileNames, toBeAddedFolderNames);
                return;
            }

            let fileName = toBeRemovedNames.pop();
            let filePath = path.join(destDirectory, internalFolderPath, fileName);

            fse.remove(filePath, (err) => {
                if (err) {
                    callback(err);
                    return;
                }

                processRemove(toBeRemovedNames, toBeAddedFileNames, toBeAddedFolderNames);
            });
        };

        // 判断指定的目录和文件是否匹配中忽略模式列表
        let isIgnoreFile = (fileName) => {
            if (ignoreFileGlobs === undefined) {
                return false;
            }

            let filePath = path.join(internalFolderPath, fileName);

            for (let ignoreFile of ignoreFileGlobs) {
                // https://github.com/isaacs/minimatch
                //
                // options 当中的 matchBase
                // If set, then patterns without slashes will be matched against the basename
                // of the path if it contains slashes. For example, a?b would match
                // the path /xyz/123/acb, but not /xyz/acb/123.
                // if (minimatch(filePath, ignoreFile, {matchBase: true})) {
                if (minimatch(filePath, ignoreFile)) {
                    return true;
                }
            }

            return false;
        }

        // 判断文件信息项目（AbstractFileInfo）是否为文件夹
        let isFolder = (abstractFileInfo) => {
            return (abstractFileInfo instanceof FolderInfo);
        };

        let findFileInfoItemByFileName = (fileInfoList, fileName) => {
            return fileInfoList.find((item) => {
                return item.fileName === fileName;
            });
        };

        let sourceFolderPath = path.join(sourceDirectory, internalFolderPath);
        let destFolderPath = path.join(destDirectory, internalFolderPath);

        FileUtils.list(sourceFolderPath, (err, sourceFileInfoList) => {
            if (err) {
                callback(err);
                return;
            }

            fse.ensureDir(destFolderPath, (err) => {
                if (err) {
                    callback(err);
                    return;
                }

                FileUtils.list(destFolderPath, (err, destFileInfoList) => {
                    if (err) {
                        callback(err);
                        return;
                    }

                    let toBeRemovedFileNames = [];

                    if (deleteExtraneous) {
                        // 当 deleteExtraneous 参数为 true 时，
                        // - 删除目标文件夹多出来的内容，即目标文件夹存在，但源文件夹不存在的内容
                        // - 删除文件类型不同的同名内容，比如同名的源文件是文件，目标文件是文件夹
                        for (let destFileInfoItem of destFileInfoList) {
                            let sourceFileInfoItem = findFileInfoItemByFileName(sourceFileInfoList, destFileInfoItem.fileName);
                            if (sourceFileInfoItem === undefined ||
                                isFolder(sourceFileInfoItem) !== isFolder(destFileInfoItem)) {
                                if (!isIgnoreFile(destFileInfoItem.fileName)) {
                                    toBeRemovedFileNames.push(destFileInfoItem.fileName);
                                }
                            }
                        }
                    } else {
                        // 删除文件类型不同的同名内容，比如同名的源文件是文件，目标文件是文件夹
                        for (let destFileInfoItem of destFileInfoList) {
                            let sourceFileInfoItem = findFileInfoItemByFileName(sourceFileInfoList, destFileInfoItem.fileName);
                            if (sourceFileInfoItem !== undefined &&
                                isFolder(sourceFileInfoItem) !== isFolder(destFileInfoItem)) {
                                if (!isIgnoreFile(destFileInfoItem.fileName)) {
                                    toBeRemovedFileNames.push(destFileInfoItem.fileName);
                                }
                            }
                        }
                    }

                    let toBeAddedFileNames = sourceFileInfoList.filter((item) => {
                        return (
                            !isFolder(item) &&
                            !isIgnoreFile(item.fileName));
                    }).map((item) => {
                        return item.fileName;
                    });

                    let toBeAddedFolderNames = sourceFileInfoList.filter((item) => {
                        return (
                            isFolder(item) &&
                            !isIgnoreFile(item.fileName));
                    }).map((item) => {
                        return item.fileName;
                    });

                    processRemove(toBeRemovedFileNames, toBeAddedFileNames, toBeAddedFolderNames);
                });
            });
        });
    }

    /**
     *
     * @param {*} sourceFolderDirectory
     * @param {*} destFolderDirectory
     * @param {*} fileNames
     * @param {*} callback 回调返回 (err)
     */
    static _updateFiles(sourceFolderDirectory, destFolderDirectory, fileNames, callback) {

        let processNext = (remainFileNames) => {
            if (remainFileNames.length === 0) {
                callback();
                return;
            }

            let fileName = remainFileNames.pop();
            let sourceFilePath = path.join(sourceFolderDirectory, fileName);
            let destFilePath = path.join(destFolderDirectory, fileName);

            FolderSync._updateFile(sourceFilePath, destFilePath, (err) => {
                if (err) {
                    callback(err);
                    return;
                }

                processNext(remainFileNames);
            });
        };

        processNext(fileNames);
    }

    /**
     *
     * @param {*} sourceFilePath
     * @param {*} destFilePath
     * @param {*} callback 回调返回 (err)
     */
    static _updateFile(sourceFilePath, destFilePath, callback) {
        let processCopyOrOverwriteFile = () => {

            let copyOptions = {
                // 保留文件的时间戳
                // 即设置文件的 last modification 和 access times 跟源文件一样
                preserveTimestamps: true
            };

            // https://github.com/jprichardson/node-fs-extra/blob/master/docs/copy.md
            fse.copy(sourceFilePath, destFilePath, copyOptions, (err) => {
                if (err) {
                    callback(err);
                    return;
                }

                callback();
            });
        };

        // 计算源文件的散列值
        FileUtils.hashFile(sourceFilePath, HashAlgorithm.sha256, (err, sourceFileHash) => {
            if (err) {
                callback(err);
                return;
            }

            // 检测目标文件是否存在
            FileUtils.exists(destFilePath, (err, isExists) => {
                if (err) {
                    callback(err);
                    return;
                }

                if (!isExists) {
                    // 目标文件不存在
                    processCopyOrOverwriteFile();
                    return;
                }

                // 计算目标文件的散列值
                FileUtils.hashFile(destFilePath, HashAlgorithm.sha256, (err, destFileHash) => {
                    if (err) {
                        callback(err);
                        return;
                    }

                    if (sourceFileHash === destFileHash) {
                        // 文件内容一致，不需要更新文件
                        callback();
                        return;
                    }

                    processCopyOrOverwriteFile();
                });
            });
        });
    }
}

module.exports = FolderSync;