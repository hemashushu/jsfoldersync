const FolderSync = require('./foldersync');

class PromiseFolderSync {
    static sync(sourceFolderPath, destDirectory, deleteExtraneous, ignoreFileGlobs) {
        return new Promise((resolve, reject) => {
            FolderSync.sync(sourceFolderPath, destDirectory,
                deleteExtraneous, ignoreFileGlobs, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}

module.exports = PromiseFolderSync;