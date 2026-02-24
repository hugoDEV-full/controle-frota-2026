let __SELF = this; // http://perfectionkills.com/understanding-delete/
__SELF.default_center = {'lat': -15.8020764, 'lon': -47.9705259};
__SELF.map_style = [{"stylers": [{"saturation": -100}]},{"featureType": "administrative","elementType": "labels.text.stroke","stylers": [{"color": "#ffffff"},{"weight": 4}]},{"featureType": "administrative","elementType": "labels.text.fill","stylers": [{"color": "#333333"}]},{"featureType": "water","elementType": "geometry.fill","stylers": [{"color": "#0099dd"}]},{"elementType": "labels","stylers": [{"visibility": "on"}]},{"featureType": "landscape.natural","elementType": "geometry","stylers": [{"color": "#ced9be"}]},{"featureType": "poi.park","elementType": "geometry.fill","stylers": [{"color": "#6cca6e"}]},{"featureType": "road.highway","elementType": "labels","stylers": [{"visibility": "on"}]},{"featureType": "road.arterial","elementType": "labels.text","stylers": [{"visibility": "on"}]},{"featureType": "road.local","elementType": "labels.text","stylers": [{"visibility": "on"}]},{}
];

/* DEBUG */
	let d = function(txt, color){
		if( !color )
			color="black";
			
		try{
			document.getElementById("debug").innerHTML += "<pre style='color:"+color+";'>"+txt+"</pre>";
		}
		catch(err){}
		
		try{
			console.log("%c "+txt, "color:"+color);
		}
		catch(err){}
	}

	/* LAZY LOAD */
	let JS = {
		load: function(src, callback) {
			let script = document.createElement('script'), loaded;
			script.setAttribute('src', src);
			script.setAttribute('type', 'text/javascript');
			if (callback) {
				script.onreadystatechange = script.onload = function() {
					if (!loaded) {
						d(src+" OK", "green");
						callback();
					}
					loaded = true;
				};
			}
			document.getElementsByTagName('head')[0].appendChild(script);
		}
	};

/* AJAX GET */
let ajax_get = function(strURL, callback) {
	try{
		__SELF.xmlHttpReq = false;
		if (window.XMLHttpRequest) {
			__SELF.xmlHttpReq = new XMLHttpRequest();
		}
		else if (window.ActiveXObject) {
			__SELF.xmlHttpReq = new ActiveXObject("Microsoft.XMLHTTP");
		}
		__SELF.xmlHttpReq.open('GET', strURL, true);
		__SELF.xmlHttpReq.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
		__SELF.xmlHttpReq.onreadystatechange = function() {
			if ( this.readyState == 4 && this.status == 200) {
				callback(this.responseText);
			}
		}
		__SELF.xmlHttpReq.send(null);
		__SELF.xmlHttpReq = null;
	}
	catch(err){
		alert("Seu navegador não é compatível com os recursos utilizados para visualização do mapa.\nDetalhes do erro:"+err);
		return;
	}
}

/* Filtros dinamicos do mapa */
function show(category) {
	for( let i in gmarkers ){
		if (__SELF.gmarkers[i].mycategory == category) {
			__SELF.gmarkers[i].setMap(__SELF.map);
		}	
	}
	document.getElementById(category+"_box").checked = true;
}
	
function hide(category) {
	for( let i in gmarkers ){
		if (__SELF.gmarkers[i].mycategory == category) {
			__SELF.gmarkers[i].setMap(null);
		}
	}
	document.getElementById(category+"_box").checked = false;
}

function boxclick(box,category) {
	if (box.checked) {
		show(category);
	}
	else {
		hide(category);
	}
}


function seconds_formated(seconds)
{
	seconds = parseInt(seconds, 10);

	let days = Math.floor(seconds / (3600*24));
	let hrs   = Math.floor(seconds / 3600);
	let mnts = Math.floor((seconds - (hrs * 3600)) / 60);
	let secs = seconds - (hrs * 3600) - (mnts * 60);
	
	let txt = "";	
	
	if( secs > 0 ){
		txt = secs + " segundos";
	}	
	if( mnts > 0 ){
		txt = mnts + " minutos";
	}	
	if( hrs > 0 ){
		txt = hrs + " horas";
	}
	if( days > 0 ){
		txt = days + " dias";
	}
	return txt;
}