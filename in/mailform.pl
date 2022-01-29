#! /usr/bin/perl
# The line above tells the script where to find Perl. Ask
# your system administrator what the path to Perl is on
# your server and enter it on the line above. The bang (!)
# is mandatory.
#
# mailform.cgi
#
# FUNCTION
# -------------------
# Sends the contents of an HTML form via e-mail. This mailer is
# designed to print form fields that are named with a leading F
# and a number (for example, F01_TextField, F02_SelectField, 
# etc.) in order in the e-mail. Field names that do not begin 
# with F, a number, and an underscore are also allowed, but they 
# will not be printed in the body of the e-mail. This allows you 
# to collect names and e-mail addresses for inclusion in the header 
# of the mail without having to repeat them in the body. It also 
# allows you to determine the order of the fields without having 
# to put the field names in the script.
#
# CONFIGURATION
# -------------------
# The MAIL variable tells the script how to find the mailer on
# your system. If you are not sure about the path to the sendmail 
# program, ask your system administrator. The -t option allows 
# you to specify the recipients in the content of the message.

$MAIL="/usr/lib/sendmail -t";

#
#
use CGI;
$\="\n";

$req=new CGI;
print $req->header;

# THE MAIN EVENT
# -------------------
%fields=&read_fields;
&send_form;
&print_thanks_page;
exit(0);


# SUBROUTINES
# -------------------

sub read_fields{
  my(%fields);
  foreach $f ($req->param){
    $name=&clean_name($f);
    $fields{$f}{name}=$name;
    $value=&clean_value($f);
    $fields{$f}{value}=$value;
  }
  return(%fields);
}

# The read_fields subroutine reads in each of the field names and
# values from the form. It calls the clean_name and clean_value
# subroutines, which remove the leading number and underscore from 
# the name and concatenate multiple values, respectively.

sub clean_name{
  local($f)=shift;
  $f=~s/^F\d+_//;
  $f=~s/_/ /g;
  return($f);
}

sub clean_value{
  local($f)=shift;
  local(@val,$val);
  @val=$req->param($f);
  $#val-- unless $val[-1]=~/\S/;
  $val=join(" - ",@val);
  return($val);
}

sub send_form{
#  return unless $fields{'mailto'}{'value'}=~/^[\w-]+@mainem\.co\.uk$/;
  open(MAIL,"| $MAIL") or error("can't send mail");
	
# This is where the $MAIL variable you defined at the top of the 
# script comes in. This line "pipes" the print MAIL commands to 
# the sendmail program on your server.
	
  print MAIL "To: $fields{'mailto'}{'value'}";
  print MAIL "From: $fields{'Name'}{'value'} <$fields{'E-mail'}{'value'}>";
  print MAIL "Reply-To: $fields{'E-mail'}{'value'}";
  print MAIL "Subject: $fields{'subject'}{'value'}";
  print MAIL "";
	
# This part of the send_form routine is customizable. It 
# currently relies on the fact that hidden form fields called 
# 'mailto' and 'subject' have been included in the form to define 
# the intended recipient(s) and the subject of the message, 
# respectively. These fields could be called something else, as 
# long as the names match in both the script and the form. The 
# 'Name' and 'E-mail' fields are also included in the form, but 
# their values are defined by the user. If you want to see how 
# the form works as-is before making any changes, simply change 
# the 'mailto' value to your own e-mail address in testform.html,
# fill out the form, and submit it. 
	
  $\="";
  $,=" - ";
  
  foreach $f (sort keys %fields){
    next unless $f=~/^F\d/;
    if ($fields{$f}{name} =~ /Comment/i) {
      print MAIL "\n";
      print MAIL "$fields{$f}{value}";
      print MAIL "\n";
    }
    else{
      print MAIL "$fields{$f}{name}: ";
      print MAIL ($fields{$f}{value} ? $fields{$f}{value} : @{$fields{$f}{'values'}});
      print MAIL "\n";
    }
  }
	
# This part of the send_form routine goes through each of the 
# fields, one at a time. The second line of the foreach loop 
# (line 125) says "skip to the next field unless the field name 
# begins with F and a number." This is what prevents the 
# unnumbered fields from printing. By the way, if you would like 
# to use a field in the header *and* have it appear in the body 
# of the message, simply assign it F and a number (for example, 
# F02_Email). Just make sure that the field is referenced as 
# F02_Email in the header section (lines 103-107). 
#
# Lines 126-130 say, "if the field name contains the word 
#'Comment' (in upper case, lowercase, or mixed case), print a 
# blank line, then the value of the field, and then another blank
# line before moving on to the next field. This conditional is 
# designed to set comments apart from other fields. If you'd like 
# to test for something other than 'Comment,' or something in 
# addition to 'Comment,' simply replace 'Comment' with the 
# keyword you expect to appear in the field name or add " || 
# /yourtext/i " (without the quotation marks) before the closing 
# parentheses on line 126.
#
# Lines 131-135 execute when the field name does not include the 
# word 'Comment.' They say, "First, print the field name and a 
# colon. Then, if there's a single value, print that; otherwise, 
# print the list of multiple values.
	
  $,="";
  close(MAIL);
}

# close(MAIL) wraps up the send_form function and sends the mail 
# to the specified recipient (you, at least during the testing 
# phase).


sub print_thanks_page{
  $\="";
  print <<"EOM";
<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">

<html>

<head>
<title>peachjuice inside feedback</title>
<meta name="keywords" content="blah de blah de blah, peach, peter arbuthnott, charlie rapple, wedding, life" />
<meta name="description" content="A specific bit of paper in the great filing cabinet in the sky" />
<script type="text/javascript" src="../peachjuice/wedding.js"></script>
</head>

<body style="border:0px;margin:0px;" alink="#FFA043" vlink="#FFA043" hlink="#FFA043" link="#FFA043">
<table width="100%" bgcolor="#CBD0FF" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" valign="top" height="800">
<font size="4" face="verdana" color="#FFA043"><b>:: http://www.peachjuice.net :: <a href="../peachjuice/in/index.html">inside</a> :: feedback</b></font><br />

<table width="500" cellpadding="0" cellspacing="0" bgcolor="#ffffff" border="0">
<tr><td align="center" valign="top" colspan="3">

	<p><font color="#FFA043" size="1" face="verdana">
	<a href="../peachjuice/index.html">peachjuice dot net</a> is a space for the exclusive
	use of those that know how to enter it. <br />
	</font></p>

	<table width="125" cellpadding="0" cellspacing="0" bgcolor="#ffffff" border="0">
	<tr><td align="center" valign="top">
		<a href="../peachjuice/in/who/peter.html" onmouseout="Javascript:flashHomes('home1');" onmouseover="Javascript:flashHomesIn('home1');"><img
		alt="peter" src="../peachjuice/gif/meickle.gif" name="home1" border="0" width="50" /></a></td>
	<td align="center" valign="top">
		<a href="../peachjuice/in/who/index.html"><img
		alt="will" src="../peachjuice/gif/will.gif" name="home2" border="0" width="25"/></a></td>
	<td align="center" valign="top">
		<a href="../peachjuice/in/who/charlie.html" onmouseout="Javascript:flashHomes('home3');" onmouseover="Javascript:flashHomesIn('home3');"><img
		alt="charlie" src="../peachjuice/gif/smileych.gif" name="home3" border="0" width="50"/></a></td>
	</tr></table>


</tr><tr><td align="center" valign="top" colspan="3">

	<hr size="0" />

	<p><font color="#FFA043" size="1" face="verdana">
	<font size="4">You're <a href="../peachjuice/in/index.html">in...</a></font><br />
	<font size="4">...Feedback</font>
	<br />
	<h3>Thanks for your feedback!</h3>

	<p align="justify">Thanks for taking the time to fill out our form. If necessary, we will contact 
	you at the e-mail address you provided, $fields{'F02_replyemail'}{'value'}.
	</p>	</p>

	<br />
	love, <a href="../peachjuice/in/who/peter.html">Peter</a> and <a href="../peachjuice/in/who/charlie.html">Charlie</a>.

	<hr size="0" />

	<script language="javascript">
		Getoday();
		WriteDaysToGo();
	</script>
	</font></p>

</td></tr>
</table>

</td></tr>
</table>
</body>

</html>
EOM
}

# Line 175 of the print_thanks_page subroutine says "print 
# everything between this line and the line that starts with 
# 'EOM'."
# This part of the code is also completely customizable; you can 
# change any of the HTML, as well as include any form field names 
# or values (in the code above, we've included the survey 
# participant's e-mail address). For example, if you created a 
# form that took an order for widgets, you could have your
# print_thanks_page subroutine print out 
#
#   Thanks very much for your order. It will be mailed to the 
#   following address within 7-10 days.
#
#   <pre>
#   $fields{'F01_Name'}{'value'}
#   $fields{'F02_Address1'}{'value'}
#   $fields{'F03_Address2'}{'value'}
#   $fields{'F04_City'}{'value'}, $fields{'F05_State'}{'value'}
#   $fields{'F06_ZIP'}{'value'}
#   </pre>
#
# (assuming that F01_Name, F02_Address1, F03_Address2, F04_City, 
# F05_State, and F06_ZIP are all fields in your form). Feedback 
# pages like this one let the users know that their orders were 
# mailed off and let them check that the information they entered 
# was correct. You might also include an e-mail address on this 
# page to which the user can send any address corrections.
