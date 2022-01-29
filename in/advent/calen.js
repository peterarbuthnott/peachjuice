// calen.js
var n = (document.layers) ? 1:0
var n6 = (parseInt(navigator.appVersion) >= 5) ? 1:0
var ie = (document.all) ? 1:0
var milissince = new Date();


function showlayer(name) {
	changeV(name, 1);
}
function changeV(name,v) {
	if(n6){ document.getElementById(name).style.visibility=(v) ? "visible":"hidden";
        	document.getElementById(name).style.display=(v) ? "block":"none"; }
	if(n) { document.layers[name].visibility=(v) ? "show":"hide";
        	document.layers[name].display=(v) ? "block":"none"; }
        if(ie){ document.all[name].style.visibility=(v) ? "visible":"hidden";
        	document.all[name].style.display=(v) ? "block":"none"; }
}
function WriteDaysToGo() {
//	var eventday = new Date(milissince.getFullYear(), 11, 25);
	var eventday = new Date(milissince.getFullYear(), 11, 15);
	var diffdays = eventday - milissince;
	var days = Math.round(diffdays / (1000*3600*24), 0);
	if (days > 0) {
		document.write("<b>" + days + "</b> days to chrimbo");
		if (days < 25) {
			for (i=1; i <= 25-days; i++) {
				showlayer("door_"+i);			
			}
		} else {
			alert ("no doors to open yet!");
		}
	} else {
		document.write("<b>" + (0 - days) + "</b> days <b>since</b> christmas");
		OpenAll();
	}
}
function OpenAll() {
	for (i=1; i < 26; i++) {
		showlayer("door_"+i);			
	}
}
function Getoday() {
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

	document.write("today :: " + this_day + ", the ");

	if (monthday < 10) monthday = ("0" + monthday);
	document.write(monthday);
	document.write(xtra + " of " + this_month + ". ");
}
