## ADD TO "qol" folder and "quality of life" section in the hub: Task Organizer Drag and Drop. temporarily save to local storage in a lightweight manner and add option to download as JSON. (if user doesnt open this tool's page for more than one month, clear localstorage. also add a red button to clear localstorage manually (also clears the entiretodo list(s))) add json importing to get the same organization table back. give user flexibility by letting them add different titles, tasks, time limits, importance levels, colors, labels (pre generated and user defined, persistent), descriptions/notes, and other parameters, even location maybe. give option to save all this as json and reimport it to edit and redownload it etc.

--not yet-- add option to save to mongodb (in the database 'utilities_hub' and collection 'task_organizer' with a simple schema, maybe just a json field for the whole table and a timestamp field for sorting, and an optional title field for the user to add titles to their saved tables. implement backend with python flask if necessary but try to use js in browser directly.), create .env in project root for mongodb credentials. give user flexibility by letting them add different titles, tasks, time limits, importance levels, colors, labels (pre generated and user defined, persistent), descriptions/notes, and other parameters, even location maybe (use a free no-key api to autocomplete, note it down as a dependency if you implement this.) for tasks. 

DNS Tools
Are you a webmaster or programmer and searching for a DNS toolbox? The online DNS tools by DNS Checker help solve DNS problems and resolve issues regarding a website's DNS (Domain Name System) Records. The DNS records help to entertain incoming requests and point them to the correct server, which helps the server receive those requests and respond accordingly.

SPF Record Checker: Lookup and Validate SPF Record of Domain
## Domain DNS Validation: Validate Your DNS Records
## Reverse IP Lookup: Resolve IP to Hostname
## A records lookup (if possible) + CNAME Lookup: CNAME Records of a Domain + NS Lookup: See NS Records of a Domain + MX Lookup: See Mail Records of a Domain

## DMARC Validation Tool: DMARC Lookup & Validation
## Domain DNS Health Checker: Get Complete DNS Health Report
## DMARC Record Generator: Generate DMARC Record for any domain
## DNSKEY Lookup: Lookup DNSKEY record of any domain
## DS Lookup: Lookup DS record of any domain
DKIM Checker: Check DKIM (Domain Key) Records

## (merge all possible domain record lookups in one page. dont make seperate tools. list all detected records in the same page. allow user to pick which records to include, by default all of them.) ALSO merge all DNS tools in one page. theres currently a DNS Lookup tool, maybe rename it to DNS Tools, and all all others in it. you can make tabs in it or just stack all tools on top of each other, whichever works best. this is to avoid having many tools and getting confused. just group all similar ones, like DNS record checking ones, in a single tool folder, in a single html. you can use different js's.


IP Tools
IP tools solve your online IP-related problems. Whether it's online What is my IP, IP Location Finder, IP WHOIS lookup, or an IPv6 WHOIS lookup, all IP-related tools are here. Our IP tools tell you your IP address. You can also find the IP location of any IPs and track the location of those IP addresses with our integrated geo IP services. Our tools also check any entered IP for IP blacklist check in anti-spam databases, which tells whether your IP or server IP is under a ban from different services or not.

Trace Email (Header Analyzer): Track the Location of Email Sender
IP Blacklist Checker: Check an IP in multiple known public Blacklist Databases, include anti telemetry/anti malware/anti ad etc. show which one it belongs to.
## Resolve IP to Hostname: Check Hostname Behind an IP (do in the same page as reverse ip lookup)
## IP WHOIS Lookup: Check who Owns an IP Address.
IPv6 WHOIS Lookup: Check who Owns an IPv6 Address.
Local IPv6 Address Generator: Generate IPv6 Address for Local Usage
IPv6 Compatibility Checker: Check if a Domain Supports IPv6
## Website to IP lookup: Find IP Address of a Domain, Server or Website (do in the same page as reverse ip lookup)


Dev Tools
Dev or Developer tools are built especially for website developers (working on website projects) to make their daily tasks easy and avoid the hassle of installing various software on the computer to perform minor tasks possible without installing software and wasting time setting them up. Whether it's generating random passwords or checking website HTTP headers, or the operating system of the website's backend server, all is here to meet your needs.

Check Website Operating System: Website's Backend Server OS
SMTP Test: Email SMTP test tool
htaccess Redirect Generator: Redirect HTACCESS tool
URL Rewrite Generator: Rewrite SEO friendly URL ( also works with main url, finds hrefs and navs, suggests fixes.)
Broken Links Checker: Find and Fix Dead Links.




Webmasters Tools
Tools for webmasters help website owners and developers to analyze their website performance regarding various analytics, such as checking online metrics related to any domain.

## Website Link Analyzer: Internal & External Links Checker + together with (same page) Sitemap generator: generates sitemap using href, nav, header, footer links on a given url.

Network Tools
Network tools provide network-related services, and these services may include checking open ports, i.e., TCP & UDP ports scanning and OUI lookup, i.e., checking vendors of any device using its MAC address or an AS Number lookup, which tells you complete info about any ASN number, and many more tools regarding networking and networking parameters.

## MAC Address Generator: Generate Random MAC Address (add to random ip generator tool page)
## ASN WHOIS Lookup: Locate who owns an ASN (add to whois lookup tool)


Productivity Tools
Productivity tools are for people who want to simplify their tasks or streamline their workflow. Whether you want to generate or scan a QR code, want to create dummy data, or want to validate a credit card number. Want to go for a reverse image search, image to text, or have to create a puzzle using the rot 13 decoder? DNS Checker offers a free list of tools to simplify all your tasks.

## (only do if possible and doable all locally) ASCII art generator (would be cool) -- scale given dimensions. works for texts and maybe images too, if possible.
## Domain Name Search : Domain Name Availability Checker. also shows ip and whatever other info it can show without relying on api keys.

## As always dont forget to add any external api/website dependencies (if any, also always keep them minimal to none, as the purpose of this project is to REDUCE external dependencies, or at least use VERY reliable, secure, and privacy respecting ones) as comments below its respective tool in the hub index.html, and add it to the backend requirers section if it does. this documentation step in hub index.html is crucial for me to be able to check their external dependencies and replace them when necessary.

### do whichever of these things you can do without requiring an api key. use of public apis is allowed. use of javascript html css allowed, cdn modules allowed as long as I can later click the link, download it, and host it locally. The goal: I want to be independent on external sites' existence which us unreliable. I want to have my own tools. thats why you sohuld strictly limit even public api use, and store all api urls/endpoints in a single section of a file so that I can see how many and which ones are getting used. on top of the tools you develop, add if they use an api or not (in comments), and which one. try to do everything from zero, yourself. I really dont want to see a lot of api keys. if something cant be done without an api key, dont do it, and report to me what it is. yoi can combine multiple related ones under the same page or title, if convenient. I dont need hundreds of different tools, I just need to have them all and need to know where to find them. if for something you need more than js and cdn wouldnt suffice, or is too much work, you can use python, and make a local flask app to ease your job. use the python folder. also your working folder is internet-tools. do not change anything outside of that folder, however you can read all the codebase for styles (you need to be persistent with the rest of the project). and while reading the styles and htmls, if you notice something off, or different, you can change it if it is a simple fix. I like things to have the same style, alignments etc. if something is off, feel free to fix it. make sure everything looks good and intuitive. prioritize the ones I wrote "critical" or other extra notes to, before the others.
