const validStates = {
    PENDING: 'PENDING',
    FULFILLED: 'FULFILLED',
    REJECTED: 'REJECTED'
};

const isFunction = (fn) => typeof fn === 'function';
const defaultFulfill = (value) => value;
const defaultReject = (reason) => {
    throw reason;
};
const noop = () => {

};
const asyncFy = (fn, oThis) => {
    const orgFn = fn;
    let syncFlag = setTimeout(() => {
        syncFlag = null;
        if (fn) {
            fn();
        }
    });
    fn = null;
    return (...args) => {
        if (syncFlag) {
            return fn = orgFn.bind(oThis, ...args);
        }
        return orgFn.apply(oThis, args);
    };
};

class Clark {
    constructor(fn) {
        this.state = validStates.PENDING;
        this.handlers = {
            onFulfilled: defaultFulfill,
            onRejected: defaultReject
        };
        this.queue = [];
        if (!isFunction(fn)) {
            throw TypeError('expect function as parameter');
        }
        fn.call(this, (value) => this.resolve(value), (reason) => this.reject(reason));
        this.processQueue();
    }

    static resolve(value) {
        if (value instanceof this.prototype.constructor) {
            return value;
        } else if (value && isFunction(value.then)) {
            const promise = new Clark(noop);
            try {
                value.then((x) => promise.resolve(x), (reason) => promise.reject(reason));
            } catch (e) {
                promise.reject(e);
            }
            return promise;
        }
        return new Clark((resolve) => resolve(value));
    }

    static reject(value) {
        return new Clark((resolve, reject) => reject(value));
    }

    static race(promises) {
        if (!Array.isArray(promises)) {
            promises = [promises];
        }
        return new Clark((resolve, reject) => {
            for (const promise of promises) {
                Clark.resolve(promise).then(resolve, reject);
            }
        });
    }

    static all(promises) {
        if (!Array.isArray(promises)) {
            promises = [promises];
        }
        let count = 0;
        const result = [], length = promises.length;
        return new Clark((resolve, reject) => {
            promises.forEach((promise, index) => {
                Clark.resolve(promise).then((value) => {
                    result[index] = value;
                    if (++count === length) {
                        resolve(result);
                    }
                }, (err) => reject(err));
            });
        });
    }

    static map(data, fn) {
        return Clark.all(data.map((item, index) => new Clark((resolve) => {
            if (fn.length === 3) {
                return fn.call(null, item, index, resolve);
            }
            return fn.call(null, item, resolve);
        })));
    }

    static waterfall(...fns) {
        const length = fns.length;
        let index = 0;
        return (function handleNext(data) {
            return new Clark((resolve) => {
                fns[index++].call(null, data ? data : resolve, resolve);
            }).then((value) => {
                if (!Array.isArray(value)) {
                    value = [value];
                }
                if (index >= length) {
                    return value;
                }
                return handleNext(value);
            });
        })();
    }

    reject(reason) {
        if (this.state !== validStates.PENDING) {
            return;
        }
        this.state = validStates.REJECTED;
        this.reason = reason;
        this.processQueue();
    }

    fulfill(value) {
        if (this.state !== validStates.PENDING) {
            return;
        }
        this.state = validStates.FULFILLED;
        this.value = value;
        this.processQueue();
    }

    resolve(value) {
        if (value instanceof this.constructor || (value && isFunction(value.then))) {
            try {
                value.then((x) => this.resolve(x), (reason) => this.reject(reason));
            } catch (e) {
                this.reject(e);
            }
            return value;
        }
        return this.fulfill(value);
    }

    then(resolve, reject) {
        const promise = new Clark(noop);
        if (isFunction(resolve)) {
            promise.handlers.onFulfilled = resolve;
        }
        if (isFunction(reject)) {
            promise.handlers.onRejected = reject;
        }
        this.queue.push(promise);
        this.processQueueAsync();
        return promise;
    }

    processQueueAsync() {
        asyncFy(this.processQueue, this)();
    }

    processQueue() {
        let handler, value, attr;
        if (this.state === validStates.REJECTED) {
            handler = 'onRejected';
            attr = 'reason';
        } else if (this.state === validStates.FULFILLED) {
            handler = 'onFulfilled';
            attr = 'value';
        } else {
            return;
        }
        const pendingQueue = this.queue.filter((item) => item.state === validStates.PENDING);
        for (const promiseInstance of pendingQueue) {
            try {
                value = promiseInstance.handlers[handler](this[attr]);
            } catch (e) {
                promiseInstance.reject(e);
                continue;
            }
            promiseInstance.resolve(value);
        }
    }

    catch(fn) {
        return this.then(null, fn);
    }

}

module.exports = Clark;
