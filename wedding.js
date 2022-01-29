// wedding.js

function WriteDaysToGo() {
	var todays = new Date();
	var eventday = new Date(2005, 6, 30);
//	document.write("<br>todays = " + todays);
//	document.write("<br>eventday = " + eventday);
	var diffdays = eventday - todays;
	var days = Math.round(diffdays / (1000*3600*24), 0);
	if (days > 0) {
		document.write("<br>days to go till wedding :: <b>" + days + "</b></font>");
	} else {
		document.write("<br>days <b>past since</b> the wedding :: <b>" + (0 - days) + "</b></font>");
	}
}

function Getoday() {
	var milissince = new Date();

	var dayno = milissince.getDay();
		if (dayno == 0) this_day = "Sunday";
		if (dayno == 1) this_day = "Monday";
		if (dayno == 2) this_day = "Tuesday";
		if (dayno == 3) this_day = "Wednesday";
		if (dayno == 4) this_day = "Thursday";
		if (dayno == 5) this_day = "Friday";
		if (dayno == 6) this_day = "Saturday";

	var monthno = milissince.getMonth();
		if (monthno == 0) this_month = "January";
		if (monthno == 1) this_month = "February";
		if (monthno == 2) this_month = "March";
		if (monthno == 3) this_month = "April";
		if (monthno == 4) this_month = "May";
		if (monthno == 5) this_month = "June";
		if (monthno == 6) this_month = "July";
		if (monthno == 7) this_month = "August";
		if (monthno == 8) this_month = "September";
		if (monthno == 9) this_month = "October";
		if (monthno == 10) this_month = "November";
		if (monthno == 11) this_month = "December";

	var monthday = milissince.getDate();
		var xtra = "th";
		if (monthday == 1) xtra = "st";
		if (monthday == 21) xtra = "st";
		if (monthday == 31) xtra = "st";
		if (monthday == 2) xtra = "nd";
		if (monthday == 22) xtra = "nd";
		if (monthday == 3) xtra = "rd";
		if (monthday == 23) xtra = "rd";

	document.write("<font color='#FFA043' size='1' face='verdana'>today :: " + this_day + ", the ");

	if (monthday < 10) monthday = ("0" + monthday);
	document.write(monthday);
	document.write(xtra + " of " + this_month + ". ");
}

// Thought (tm) 1997, Peter Arbuthnott, Consolution.com
// takes a random number, appends it to the image name and writes it
// to a document.  any thought may appear...
//
function Thought()
{
	var random = Math.round(Math.random()*3+1);
	if (random < 10) random="0"+random;
	var txt="logo"+random;
	document.write("<img src=\"logos/"+txt+".gif\" width=\"100\" height=\"280\" border=\"0\">");
//	document.write("<img src=\"logos/"+txt+".gif\" border=\"0\">");
}

//function Thought()
//{
//        var random = Math.round(Math.random()*1+1);
//        if (random < 10) random="0"+random;
//        var txt="thbubl"+random;
//        document.write("<img src=\"images/"+txt+".gif\" border=\"0\">");
//}


//stolen code from yourmum.com!
bName = navigator.appName;
bVer = parseInt(navigator.appVersion);
        if (bName == "Netscape" && bVer == 3) ver = "n3";
        else if (bName == "Netscape" && bVer == 2) ver = "n2";
        else if (bName == "Netscape" && bVer >= 4) ver = "n4";
        else if (bName == "Microsoft Internet Explorer" && bVer == 2) ver = "e3";
        else if (bName == "Microsoft Internet Explorer" && bVer > 2) ver = "e4";

if (navigator.appVersion.indexOf("Mac") != -1) ver+="m";
function quiver() {
        if (ver == "n4" || ver == "n4m" || ver == "e4" || ver == "e4m") {
                 for (i = 40; i > 0; i--) {
                        self.moveBy(i,0);
                        self.moveBy(-i,0);
                }
        }
}

function flashHomesOld(imgName) {
//	for (var j = 4; j > 0; j--) {
	        var j = Math.round(Math.random()*1+1);
		document.images[imgName].src = "/gif/home" + j + ".gif";
//	}
}

function flashHomes(imgName) {
//	for (var j = 4; j > 0; j--) {
	        var j = Math.round(Math.random()*1+1);
		var CurUrl = document.location.href;
//		window.alert('CurUrl = ' + CurUrl);
		document.images[imgName].src = "/peachjuice/gif/home" + j + ".gif";
//	}
}

function checkUnPw() {
	if (document.location.search) {
		var dataIn = document.location.search;
//		window.alert('dataIn = ' + dataIn);

		var bits = dataIn.split('&');
		var unbits = bits[0].split('=');
		var pwbits = bits[1].split('=');

		if (unbits[1] == "peach") {
//			window.alert('pwbits = ' + pwbits);
			if (pwbits[1] == "wedding") {
				window.alert('Its all good.  Redirecting...');
				document.cookie = escape ('peachCookie=true');
				document.forms.login.action = 'in/index.html';
				document.forms.login.submit();
			} else if (pwbits[1] == "sp3cial") {
				window.alert('Its all good.  Redirecting to Admin...');
				document.cookie = escape ('peachCookie=true');
				document.forms.login.action = 'in/admin.html';
				document.forms.login.submit();
			} else {
				window.alert('no cigar...');
			}
		} else {
			window.alert('no cigar...');
		}
	}
}

function doQuiz() {
	var quizwin = window.open('quiz.html','','toolbar=no,location=no,status=no,menubar=no,resizable=no,width=400,height=300');
	quizqin.focus();
}

function quizResult() {
	var result = document.location.search;
	var bits = result.split('=');
	if (bits[1] == "2.1") {
/*** old quiz...
		document.write('You is all right. They first did it 25 months ago.');
***/
		document.write('You is all right. They did it at Durdle Door.');
	} else {
		document.write('No no no no no, but feel free to try again...');
	}
}

function readCookie(name) {
	if (document.cookie == '') { 
 		return false;
	} else {
		var firstChar, lastChar;
		var theBigCookie = document.cookie;
		firstChar = theBigCookie.indexOf(name);
		if(firstChar != -1)  {
			firstChar += name.length + 3;
			lastChar = theBigCookie.indexOf(';', firstChar);
			if(lastChar == -1) lastChar = theBigCookie.length;
//			alert ('readCookie returning : ' + unescape(theBigCookie.substring(firstChar, lastChar)) + ' see');
			return unescape(theBigCookie.substring(firstChar, lastChar));
		} else {
		   // If there was no cookie of that name, return false.
		return false;
		}
	}
}

// commented out - no more access control on in pages...
//var UrlString = new String(document.location);
//if (UrlString.indexOf('/in/') != -1) {
//	var theCookie;
//	if (readCookie('peachCookie')) {
//		alert ('checked and found...');
//		theCookie = readCookie('peachCookie');	
//	} else {
//		alert ('oops -- you not logged in, but you try to access hidden stuff\n' +
//			'there be no cheating allowed here...\n' +
//			'bye bye.');
//		document.location = '/peachjuice/index.html';
//	}
//}