const axios = require('axios');
const CookieBuilder = require('cookie');
const Base64 = require('./Base64');
const moment = require('moment');

/**
 * WebUntis API Class
 */
class WebUntis {

    /**
     *
     * @param {String} school
     * @param {String} username
     * @param {String} password
     * @param {String} baseurl
     * @param {String} identity
     */
    constructor(school, username, password, baseurl, identity = "Awesome") {
        this.school = school;
        this.schoolbase64 = "_" + Base64.btoa(this.school);
        this.username = username;
        this.password = password;
        this.baseurl = "https://" + baseurl + "/";
        this.cookies = [];
        this.id = identity;
        this.sessionInformation = {};

        this.axios = axios.create({
            baseURL: this.baseurl,
            maxRedirects: 0,
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.79 Safari/537.36",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
                "X-Requested-With": "XMLHttpRequest"
            },
            validateStatus: function (status) {
                return status >= 200 && status < 303; // default
            }
        });
    }

    /**
     * Logout the current session
     * @returns {Promise<boolean>}
     */
    async logout() {
        await this.axios({
            method: "POST",
            url: `/WebUntis/jsonrpc.do?school=${this.school}`,
            data: {
                id: this.id,
                method: "logout",
                params: {},
                jsonrpc: "2.0"
            }
        });
        this.sessionInformation = null;
        return true;
    }

    /**
     * Login with your credentials
     * @returns {Promise<Object>}
     */
    async login() {
        const response = await this.axios({
            method: "POST",
            url: `/WebUntis/jsonrpc.do?school=${this.school}`,
            data: {
                id: this.id,
                method: "authenticate",
                params: {
                    user: this.username,
                    password: this.password,
                    client: this.id
                },
                jsonrpc: "2.0"
            }
        });
        if (typeof response.data !== 'object') throw new Error("Failed to parse server response.");
        if (!response.data.result) throw new Error("Failed to login. " + JSON.stringify(response.data));
        if (response.data.result.code) throw new Error("Login returned error code: " + response.data.result.code);
        if (!response.data.result.sessionId) throw new Error("Failed to login. No session id.");
        this.sessionInformation = response.data.result;
        return response.data.result;
    }

    /**
     * Get the latest WebUntis Schoolyear
     * @param {Boolean} [validateSession=true]
     * @returns {Promise<{name: String, id: Number, startDate: Date, endDate: Date}>}
     */
    async getLatestSchoolyear(validateSession = true) {
        const data = await this._request('getSchoolyears', {}, validateSession);
        data.sort((a, b) => {
            const na = moment(a.startDate, 'YYYYMMDD').toDate();
            const nb = moment(b.startDate, 'YYYYMMDD').toDate();
            return nb - na;
        });
        if (!data[0]) throw new Error("Failed to receive school year");
        return {
            name: data[0].name,
            id: data[0].id,
            startDate: moment(data[0].startDate, 'YYYYMMDD').toDate(),
            endDate: moment(data[0].endDate, 'YYYYMMDD').toDate()
        }
    }

    /**
     *
     * @returns {string}
     * @private
     */
    _buildCookies() {
        let cookies = [];
        cookies.push(CookieBuilder.serialize('JSESSIONID', this.sessionInformation.sessionId));
        cookies.push(CookieBuilder.serialize('schoolname', this.schoolbase64));
        return cookies.join('; ');
    }

    /**
     * Checks if your current WebUntis Session is valid
     * @returns {Promise<boolean>}
     */
    async validateSession() {
        const response = await this.axios({
            method: "POST",
            url: `/WebUntis/jsonrpc.do?school=${this.school}`,
            headers: {
                "Cookie": this._buildCookies()
            },
            data: {
                id: this.id,
                method: "getLatestImportTime",
                params: {},
                jsonrpc: "2.0"
            }
        });
        return typeof response.data.result === 'number';
    }

    /**
     * Get the time when WebUntis last changed it's data
     * @param {Boolean} [validateSession=true]
     * @returns {Promise<Number>}
     */
    async getLatestImportTime(validateSession = true) {
        return this._request("getLatestImportTime", {}, validateSession)
    }

    /**
     * Get your own Timetable for the current day
     * @param {Boolean} [validateSession=true]
     * @returns {Promise<Object>}
     */
    async getOwnTimetableForToday(validateSession = true) {
        return this._request("getTimetable", {
            "options": {
                "element": {
                    "id": this.sessionInformation.personId,
                    "type": this.sessionInformation.personType
                },
                "showLsText": true,
                "showStudentgroup": true,
                "showLsNumber": true,
                "showSubstText": true,
                "showInfo": true,
                "showBooking": true,
                "klasseFields": ["id", "name", "longname", "externalkey"],
                "roomFields": ["id", "name", "longname", "externalkey"],
                "subjectFields": ["id", "name", "longname", "externalkey"],
                "teacherFields": ["id", "name", "longname", "externalkey"]
            }
        }, validateSession);
    }

    /**
     * Get your own Timetable for the given day
     * @param {Date} date
     * @param {Boolean} [validateSession=true]
     * @returns {Promise.<Object>}
     */
    async getOwnTimetableFor(date, validateSession = true) {
        return this._request("getTimetable", {
            "options": {
                "element": {
                    "id": this.sessionInformation.personId,
                    "type": this.sessionInformation.personType
                },
                "startDate": this.convertDateToUntis(date),
                "endDate": this.convertDateToUntis(date),
                "showLsText": true,
                "showStudentgroup": true,
                "showLsNumber": true,
                "showSubstText": true,
                "showInfo": true,
                "showBooking": true,
                "klasseFields": ["id", "name", "longname", "externalkey"],
                "roomFields": ["id", "name", "longname", "externalkey"],
                "subjectFields": ["id", "name", "longname", "externalkey"],
                "teacherFields": ["id", "name", "longname", "externalkey"]
            }
        }, validateSession);
    }

    /**
     * Get your own timetable for a given Date range
     * @param {Date} rangeStart
     * @param {Date} rangeEnd
     * @param {Boolean} [validateSession=true]
     * @returns {Promise.<Object>}
     */
    async getOwnTimetableForRange(rangeStart, rangeEnd, validateSession = true) {
        return this._request("getTimetable", {
            "options": {
                "element": {
                    "id": this.sessionInformation.personId,
                    "type": this.sessionInformation.personType
                },
                "startDate": this.convertDateToUntis(rangeStart),
                "endDate": this.convertDateToUntis(rangeEnd),
                "showLsText": true,
                "showStudentgroup": true,
                "showLsNumber": true,
                "showSubstText": true,
                "showInfo": true,
                "showBooking": true,
                "klasseFields": ["id", "name", "longname", "externalkey"],
                "roomFields": ["id", "name", "longname", "externalkey"],
                "subjectFields": ["id", "name", "longname", "externalkey"],
                "teacherFields": ["id", "name", "longname", "externalkey"]
            }
        }, validateSession);
    }

    /**
     * Get the Timetable of your class for today
     * @param {Boolean} [validateSession=true]
     * @returns {Promise<Object>}
     */
    async getOwnClassTimetableForToday(validateSession = true) {
        return this._request("getTimetable", {
            "options": {
                "element": {
                    "id": this.sessionInformation.klasseId,
                    "type": 1
                },
                "showLsText": true,
                "showStudentgroup": true,
                "showLsNumber": true,
                "showSubstText": true,
                "showInfo": true,
                "showBooking": true,
                "klasseFields": ["id", "name", "longname", "externalkey"],
                "roomFields": ["id", "name", "longname", "externalkey"],
                "subjectFields": ["id", "name", "longname", "externalkey"],
                "teacherFields": ["id", "name", "longname", "externalkey"]
            }
        }, validateSession);
    }

    /**
     *
     * @param {Date} rangeStart
     * @param {Date} rangeEnd
     * @param {Boolean} [validateSession=true]
     * @returns {Promise.<Object>}
     */
    async getHomeWorksFor(rangeStart, rangeEnd, validateSession = true) {
        if (validateSession && !await this.validateSession()) throw new Error("Current Session is not valid");
        const response = await this.axios({
            method: "GET",
            url: `/WebUntis/api/homeworks/lessons?startDate=${this.convertDateToUntis(rangeStart)}&endDate=${this.convertDateToUntis(rangeEnd)}`,
            headers: {
                "Cookie": this._buildCookies()
            }
        });
        if (typeof response.data.data !== 'object') throw new Error("Server returned invalid data.");
        if (!response.data.data["homeworks"]) throw new Error("Data object doesn't contains homeworks object.");
        return response.data.data;
    }

    /**
     * Get all known Subjects for the current logged in user
     * @param {Boolean} [validateSession=true]
     * @returns {Promise.<Object>}
     */
    async getSubjects(validateSession = true) {
        return await this._request('getSubjects', {}, validateSession);
    }

    /**
     * Get the timegrid of current school
     * @param {Boolean} [validateSession=true]
     * @returns {Promise.<Object>}
     */
    async getTimegrid(validateSession = true) {
        return await this._request('getTimegridUnits', {}, validateSession);
    }

    /**
     *
     * @param {Date} rangeStart
     * @param {Date} rangeEnd
     * @param {Boolean} [validateSession=true]
     * @returns {Promise.<void>}
     */
    async getHomeWorkAndLessons(rangeStart, rangeEnd, validateSession = true) {
        if (validateSession && !await this.validateSession()) throw new Error("Current Session is not valid");
        const response = await this.axios({
            method: "GET",
            url: `/WebUntis/api/homeworks/lessons?startDate=${this.convertDateToUntis(rangeStart)}&endDate=${this.convertDateToUntis(rangeEnd)}`,
            headers: {
                "Cookie": this._buildCookies()
            }
        });
        if (typeof response.data.data !== 'object') throw new Error("Server returned invalid data.");
        if (!response.data.data["homeworks"]) throw new Error("Data object doesn't contains homeworks object.");
        return response.data.data;
    }

    /**
     * Get all known rooms by WebUntis
     * @param {Boolean} [validateSession=true]
     * @returns {Promise.<Object>}
     */
    async getRooms(validateSession = true) {
        return await this._request('getRooms', {}, validateSession);
    }

    /**
     * Get all classes known by WebUntis
     * @param {Boolean} [validateSession=true]
     * @returns {Promise.<Object>}
     */
    async getClasses(validateSession = true) {
        return await this._request('getKlassen', {}, validateSession);
    }

    /**
     * Get all Holidays known by WebUntis
     * @param {Boolean} [validateSession=true]
     * @returns {Promise.<Object>}
     */
    async getHolidays(validateSession = true) {
        return await this._request('getHolidays', {}, validateSession);
    }

    /**
     * Convert a JS Date Object to a WebUntis date string
     * @param {Date} date
     * @returns {String}
     */
    convertDateToUntis(date) {
        return date.getFullYear().toString() + ((date.getMonth() + 1) < 10 ? "0" + (date.getMonth() + 1) : (date.getMonth() + 1)).toString() + (date.getDate() < 10 ? "0" + date.getDate() : date.getDate()).toString();
    }

    /**
     * Make a JSON RPC Request with the current session
     * @param {String} method
     * @param {Object} [parameter={}]
     * @param {String} [url='/WebUntis/jsonrpc.do?school=SCHOOL']
     * @param {Boolean} [validateSession=true] Whether the session should be checked first
     * @returns {Promise.<Object>}
     * @private
     */
    async _request(method, parameter = {}, url = `/WebUntis/jsonrpc.do?school=${this.school}`, validateSession = true) {
        if (validateSession && !await this.validateSession()) throw new Error("Current Session is not valid");
        const response = await this.axios({
            method: "POST",
            url: url,
            headers: {
                "Cookie": this._buildCookies()
            },
            data: {
                id: this.id,
                method: method,
                params: parameter,
                jsonrpc: "2.0"
            }
        });
        if (!response.data.result) throw new Error("Server didn't returned any result.");
        if (response.data.result.code) throw new Error("Server returned error code: " + response.data.result.code);
        return response.data.result;
    }
}

module.exports = WebUntis;
