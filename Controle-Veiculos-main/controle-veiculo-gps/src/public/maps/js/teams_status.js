__SELF.infowindow = {};
__SELF.url = '';
__SELF.gmarkers = new Array();
__SELF.poi_types = new Array();
__SELF.poi_static = new Array();
__SELF.poi_dynamic = new Array();
__SELF.servidor_id = 0;
__SELF.markers_list = document.createElement('ul');
__SELF.markers_list.id = 'ul_lista_markers';
__SELF.seguir_marker = 0;
__SELF.default_latlon = 0;
__SELF.theme = 'light'; // Default theme

let debug = window.location.href.indexOf('debug') > -1 ? 1 : 0;
let chamado_circle; // circulo em volta do chamado

/* RESTRICOES POR HOSPITAL */
function get_restricoes_by_hospital(hospital) {
    url = './map_points/hinfo.php?h=' + hospital;
    ajax_get(url, get_restricoes_by_hospital_callback);
}
function get_restricoes_by_hospital_callback(r) {
    __SELF.restriction = JSON.parse(r);
    __SELF.place_restriction_txt = '';
    __SELF.place_restriction_id = 0;
    for (let i in restriction) {
        __SELF.place_restriction_txt += restriction[i]['TXT'];
        __SELF.place_restriction_id = restriction[i]['H'];
    }
    __SELF.infowindow.setContent(__SELF.place_restriction_txt);
    __SELF.infowindow.open(map, gmarkers[__SELF.place_restriction_id]);

    // IE8 and older doesn't support delete on window
    try {
        delete __SELF.restriction;
        delete __SELF.place_restriction_txt;
        delete __SELF.place_restriction_id;
    } catch (e) {
        __SELF.restriction = undefined;
        __SELF.place_restriction_txt = undefined;
        __SELF.place_restriction_id = undefined;
    }
}

/* PONTOS ESTÁTICOS DO MAPA */
function get_static_map_points() {
    url = './map_points/static.php?rnd=' + Math.random();
    ajax_get(url, get_static_map_points_callback);
}
function get_static_map_points_callback(r) {
    // IE8 and older doesn't support delete on window
    try {
        delete __SELF.poi_static;
    } catch (e) {
        __SELF.poi_static = undefined;
    }

    __SELF.poi_static = JSON.parse(r);

    for (let i in __SELF.poi_static) {
        const icon = __SELF.poi_static[i]['RESTRICT'] == 0 ? 'hospital_new' : 'hospital_new';
        __SELF.__position = new google.maps.LatLng(__SELF.poi_static[i]['LAT'], __SELF.poi_static[i]['LON']);
        __SELF.__situation = __SELF.poi_static[i]['RESTRICT'] == 0 ? '0099dd' : 'FF0000';
        __SELF.__icon = '/maps/common/markers/img.php?debug=' + debug + '&i=' + icon + '&c=' + __SELF.__situation;
        __SELF.gmarkers[i] = new google.maps.Marker({
            position: __position,
            draggable: false,
            map: null,
            icon: __icon,
            title: poi_static[i]['TXT'],
        });

        __SELF.poi_types['Hospitais'] = new Array();
        __SELF.poi_types['Hospitais']['checked'] = false;
        __SELF.gmarkers[i].mycategory = 'Hospitais';
        __SELF.gmarkers[i].server_id = poi_static[i]['ID'];

        google.maps.event.addListener(__SELF.gmarkers[i], 'click', function (e) {
            get_restricoes_by_hospital(this.server_id);
        });
        //////////////// add_marker_to_list(poi_static[i]['TXT'], 'HOSP_'+poi_static[i]['ID'], __SELF.__position);
    }

    try {
        delete __SELF.poi_static;
    } catch (e) {
        __SELF.poi_static = undefined;
    }
}

function add_marker_to_list(nome, id, posicao) {
    
    let li = document.createElement('li');

    let a = document.createElement('a');
    a.setAttribute('href', 'javascript:void(0)');
    a.setAttribute('onclick', 'comecar_seguir(' + id + ', "' + nome + '")');
    a.innerHTML = nome;
    
    // Apply dark theme styling to new list items if theme is dark
    if (__SELF.theme === 'dark') {
        a.style.color = '#39b9ff';
        
        // Add hover style to maintain visibility
        li.addEventListener('mouseenter', function() {
            a.style.color = '#ffffff';
            li.style.backgroundColor = '#555';
        });
        
        li.addEventListener('mouseleave', function() {
            a.style.color = '#39b9ff';
            li.style.backgroundColor = '';
        });
    }

    li.appendChild(a);
    li.id = 'POI_' + id;
    li.setAttribute('position', posicao);

    __SELF.markers_list.appendChild(li);
}

function comecar_seguir(id, nome) {
    __SELF.seguir_marker = id;
    document.getElementById('following_span').innerHTML = 'Seguindo <b>' + nome + '</b>';
    document.getElementById('following').style.display = '';

    setTimeout(function () {
        __SELF.map.setZoom(17);
    }, 500);
}
function cancelar_seguir() {
    __SELF.seguir_marker = 0;
    __SELF.map.setZoom(16);
    document.getElementById('following_span').innerHTML = '';
    document.getElementById('following').style.display = 'none';

    document.getElementById('txt_search').value = '';
    filtrar_pontos_mapa('');
}

/* PONTOS DINAMICOS DO MAPA */
function get_dynamic_map_points() {
    __SELF.url = './map_points/dynamic.php?servidor_id=' + __SELF.servidor_id + '&debug=' + debug;
    // 	d(__SELF.url, "purple");
    ajax_get(__SELF.url, get_dynamic_map_points_callback);
}
function get_dynamic_map_points_callback(r) {
    // IE8 and older doesn't support delete on window
    try {
        delete __SELF.poi_dynamic;
    } catch (e) {
        __SELF.poi_dynamic = undefined;
    }

    __SELF.poi_dynamic = JSON.parse(r);

    // console.log(__SELF.poi_dynamic);
    for (let i in __SELF.poi_dynamic) {
        const r = __SELF.poi_dynamic[i];
        const type = r['TYPE'];
        const bgcl = r['BGCL'];
        const fgcl = r['FGCL'];
        const lat = r['LAT'];
        const lon = r['LON'];

        __SELF.__position = new google.maps.LatLng(lat, lon);
        __SELF.__icon = '/maps/common/markers/img.php?debug=' + debug + '&i=' + type + '&c=' + bgcl + '&f=' + fgcl;
        // d("Requisitando "+__SELF.__icon, "blue");

        if (__SELF.gmarkers[i]) {
            // console.log("Setando a posicao de ", poi_dynamic[i]['TXT'], " para ", __SELF.poi_dynamic[i]['LAT'], "x", __SELF.poi_dynamic[i]['LON']);
            __SELF.gmarkers[i].setPosition(__position); // Bendita linha que causa MemoryLeak no Webkit! https://groups.google.com/forum/#!topic/google-maps-js-api-v3/a9shORvfE5I
            __SELF.gmarkers[i].setIcon(__icon);

            if (__SELF.seguir_marker == __SELF.poi_dynamic[i]['TID']) {
                __SELF.map.panTo(__position);
            }
        } else {
            /*
			// console.log("Criando novo marker ", poi_dynamic[i]['TXT'], " com coordenadas ", __SELF.poi_dynamic[i]['LAT'], "x", __SELF.poi_dynamic[i]['LON']);
			__SELF.gmarkers[i] = new google.maps.Marker({
				position: __position,
				draggable: false,
				map: map,
				title: poi_dynamic[i]['TXT'],
				icon: __SELF.__icon,
				_id: __SELF.poi_dynamic[i]['TID']
			});
			*/
            // Animation:
            __SELF.gmarkers[i] = new SlidingMarker({
                position: __position,
                draggable: false,
                map: map,
                title: poi_dynamic[i]['TXT'],
                duration: 1000,
                easing: 'linear',
                icon: __SELF.__icon,
                _id: __SELF.poi_dynamic[i]['TID'],
            });

            google.maps.event.addListener(__SELF.gmarkers[i], 'click', function (e) {
                comecar_seguir(this._id, this.getTitle());
            });
            /*__SELF.gmarkers[i] = new google.maps.Marker({
				position: __position
				,map: map
				,title: poi_dynamic[i]['TXT']
				,icon: __SELF.__icon
			});*/
            __SELF.gmarkers[i].set('optimized', false);

            __SELF.poi_types['Equipes'] = [];
            __SELF.poi_types['Equipes']['checked'] = true;

            __SELF.gmarkers[i].mycategory = 'Equipes';
            __SELF.gmarkers[i].team_id = __SELF.poi_dynamic[i]['TID'];
            __SELF.gmarkers[i].server_id = i;
            __SELF.gmarkers[i].name = __SELF.poi_dynamic[i]['TXT'];

            add_marker_to_list(poi_dynamic[i]['TXT'], poi_dynamic[i]['TID'], __SELF.__position);
        }

        // IE8 and older doesn't support delete on window
        try {
            delete __SELF.__position;
            delete __SELF.__icon;
        } catch (e) {
            __SELF.__position = undefined;
            __SELF.__icon = undefined;
        }
    }

    // IE8 and older doesn't support delete on window
    try {
        delete __SELF.poi_dynamic;
    } catch (e) {
        __SELF.poi_dynamic = undefined;
    }

    if (servidor_id != 0 && endereco == '') {
        // se tiver vendo uma viatura especifica && se NAO tiver vendo um chamado
        map.setCenter(__SELF.gmarkers[servidor_id].getPosition());
    }
}

function criar_filtros_checkbox() {
    let controlDiv = document.createElement('div');
    controlDiv.setAttribute('class', 'map-control');

    for (let i in __SELF.poi_types) {
        d(i);
        let span = document.createElement('span');

        let input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = __SELF.poi_types[i]['checked'];
        input.id = i + '_box';
        input.setAttribute('onclick', "boxclick(this,'" + i + "');");

        let label = document.createElement('label');
        label.appendChild(document.createTextNode(i.charAt(0).toUpperCase() + i.slice(1))); // simulando o ucfirst() do php
        label.setAttribute('for', i + '_box');

        span.appendChild(input);
        span.appendChild(label);

        controlDiv.appendChild(span);
    }

    map.controls[google.maps.ControlPosition.TOP_CENTER].push(controlDiv);
}

/* Procura de endereço */
function procurar_endereco() {
    __SELF.endereco = __SELF.endereco.toLowerCase();
    __SELF.endereco = __SELF.endereco.replace(' cs', ', ');
    __SELF.endereco = __SELF.endereco.replace(' cs.', ', ');
    __SELF.endereco = __SELF.endereco.replace(' casa', ',');
    __SELF.endereco = __SELF.endereco.replace(' apt', ', ');
    __SELF.endereco = __SELF.endereco.replace(' apt.', ', ');
    __SELF.endereco = __SELF.endereco.replace(' apartamento', ', ');

    __SELF.geocoder.geocode({ address: __SELF.endereco }, function (results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
            create_chamado_marker(results[0].geometry.location.lat(), results[0].geometry.location.lng());
        } else {
            alert('error#O endereco informado nao foi localizado.|' + status);
        }
    });
}
function create_chamado_marker(latitude, longitude) {
    let pos = new google.maps.LatLng(latitude, longitude);
    let circleOptions = {
        strokeColor: '#FF0000',
        strokeOpacity: 0.5,
        strokeWeight: 2,
        fillColor: '#FF0000',
        fillOpacity: 0.2,
        map: map,
        center: pos,
        radius: 2000,
    };
    __SELF.chamado_circle = new google.maps.Circle(circleOptions);

    __SELF.gmarkers['chamado'] = new google.maps.Marker({
        position: pos,
        map: map,
        title: 'Possível local do atendimento. Arraste e solte para ajustar a localização.',
        icon: '/maps/common/markers/?i=telephone&c=E00000',
        flat: true, // nao mostra a sombra do icone
        optimized: false,
        draggable: true,
        raiseOnDrag: true,
    });

    map.setCenter(pos);
    map.setZoom(14);

    google.maps.event.addListener(__SELF.gmarkers['chamado'], 'dragend', function (e) {
        mostrar_coordenadas(e.latLng.lat(), e.latLng.lng());
        __SELF.chamado_circle.setCenter(e.latLng);
    });

    mostrar_coordenadas(latitude, longitude);
}
function mostrar_coordenadas(latitude, longitude) {
    if (__SELF.endereco.length <= 4) return false;
    alert('posicao_chamado#' + latitude + '|' + longitude);
}

// Apply theme to UI components
function applyTheme() {
    const isDark = __SELF.theme === 'dark';
    
    // Apply to search components
    const searchElements = document.querySelectorAll('.marker-search-form, .address-form, #div_search, #txt_search, #btn_list, #ul_lista_markers');
    searchElements.forEach(el => {
        el.classList.toggle('dark-theme', isDark);
        
        // Apply specific styles to inputs
        if (el.id === 'txt_search') {
            if (isDark) {
                el.style.backgroundColor = '#333';
                el.style.color = '#ffffff';
                el.style.border = '1px solid #555';
            } else {
                el.style.backgroundColor = '#FFFFFF';
                el.style.color = '#444';
                el.style.border = '';
            }
        }
        
        // Apply specific styles to buttons
        if (el.id === 'btn_list') {
            if (isDark) {
                el.style.backgroundColor = '#333';
            } else {
                el.style.backgroundColor = '#FFFFFF';
            }
        }
        
        // Apply styles to the markers list
        if (el.id === 'ul_lista_markers') {
            if (isDark) {
                el.style.backgroundColor = '#333';
                el.style.border = '1px solid #555';
            } else {
                el.style.backgroundColor = '';
                el.style.border = '';
            }
        }
    });
    
    // Apply to following alert
    const followingUI = document.getElementById('following');
    if (followingUI) {
        followingUI.classList.toggle('dark-theme', isDark);
    }
    
    // Apply to map controls
    const mapControls = document.querySelectorAll('.map-control');
    mapControls.forEach(el => {
        el.classList.toggle('dark-theme', isDark);
    });
    
    // Update the list items for proper hover effects
    if (isDark) {
        const items = document.querySelectorAll('#ul_lista_markers li');
        items.forEach(item => {
            const link = item.querySelector('a');
            if (link) {
                link.style.color = '#39b9ff';
                
                if (!item.hasHoverListeners) {
                    item.addEventListener('mouseenter', function() {
                        link.style.color = '#ffffff';
                        this.style.backgroundColor = '#555';
                    });
                    
                    item.addEventListener('mouseleave', function() {
                        link.style.color = '#39b9ff';
                        this.style.backgroundColor = '';
                    });
                    
                    item.hasHoverListeners = true;
                }
            }
        });
    }
}

function create_adress_search_form() {
    // Se temos um endereço completo na URL (tipo "quadra 206, conjunto 23, ...")
    if (__SELF.endereco.length >= 4) {
        let form = document.createElement('form');
        form.className = 'address-form';
        if (__SELF.theme === 'dark') {
            form.classList.add('dark-theme');
        }
        form.action = document.location.href;
        form.method = 'get';
        form.setAttribute('onsubmit', 'return checkform();');

        let txt = document.createElement('input');
        txt.type = 'text';
        txt.name = 'endereco';
        txt.id = 'address';
        txt.className = 'txt';
        txt.value = endereco;
        txt.setAttribute('aria-label', 'Endereço');

        let sid = document.createElement('input');
        sid.type = 'hidden';
        sid.name = 'servidor_id';
        sid.value = __SELF.servidor_id;

        let btn = document.createElement('a');
        btn.href = 'javascript:void(0)';
        btn.setAttribute('onclick', 'document.forms[0].submit()');
        btn.className = 'submit';
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', 'Procurar endereço');

        let icon = document.createElement('span');
        icon.innerHTML = 'Procurar endereço';
        btn.appendChild(icon);

        form.appendChild(txt);
        form.appendChild(sid);
        form.appendChild(btn);

        map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(form);
        procurar_endereco();
    }
    // Mas se ao inves do endereco tivermos diretamente os pontos latitude x longitude
    else if (__SELF.url_lat != 0 && __SELF.url_lon != 0) {
        create_chamado_marker(__SELF.url_lat, __SELF.url_lon);
    } else {
        d("Faz nada. {endereco: '" + __SELF.endereco + "', url_lat: " + __SELF.url_lat + ', url_lon: ' + __SELF.url_lon + '}', 'blue');
    }
}

function create_markers_search() {
    let div_parent = document.createElement('div');
    div_parent.className = 'marker-search-form';
    if (__SELF.theme === 'dark') {
        div_parent.classList.add('dark-theme');
    }

    let div = document.createElement('div');
    div.id = 'div_search';
    // Ensure the search div also gets the theme class
    if (__SELF.theme === 'dark') {
        div.classList.add('dark-theme');
    }

    let txt = document.createElement('input');
    txt.type = 'text';
    txt.name = 'txt_search';
    txt.id = 'txt_search';
    txt.setAttribute('placeholder', 'Pesquisar Equipe');
    txt.setAttribute('onkeyup', 'filtrar_pontos_mapa(this.value)');
    txt.setAttribute('aria-label', 'Pesquisar Equipe');
    // Apply dark theme styles directly to input if needed
    if (__SELF.theme === 'dark') {
        txt.classList.add('dark-theme');
        txt.style.backgroundColor = '#333';
        txt.style.color = '#ffffff';
        txt.style.border = '1px solid #555';
    }

    let btn_list = document.createElement('input');
    btn_list.type = 'button';
    btn_list.id = 'btn_list';
    btn_list.setAttribute('title', 'Exibir/ocultar lista');
    btn_list.setAttribute('onclick', 'toggle(document.getElementById("ul_lista_markers"))');
    btn_list.setAttribute('aria-label', 'Exibir ou ocultar lista de equipes');
    // Apply dark theme to button if needed
    if (__SELF.theme === 'dark') {
        btn_list.classList.add('dark-theme');
        btn_list.style.backgroundColor = '#333';
    }

    div.appendChild(txt);
    div.appendChild(btn_list);

    div_parent.appendChild(div);
    
    // Apply dark theme to markers list
    if (__SELF.theme === 'dark') {
        __SELF.markers_list.classList.add('dark-theme');
        __SELF.markers_list.style.backgroundColor = '#333';
        __SELF.markers_list.style.border = '1px solid #555';
    }
    
    div_parent.appendChild(__SELF.markers_list);

    map.controls[google.maps.ControlPosition.RIGHT_TOP].push(div_parent);
}

function filtrar_pontos_mapa(valor) {
    document.getElementById('ul_lista_markers').style.display = '';
    let items = __SELF.markers_list.getElementsByTagName('li');
    for (let i = 0; i < items.length; i++) {
        let a = items[i].getElementsByTagName('a')[0];
        if (a.innerHTML.toLowerCase().indexOf(valor.toLowerCase()) >= 0) {
            items[i].style.display = '';
        } else {
            items[i].style.display = 'none';
        }
        
        // Make sure dark theme is applied to visible items if theme is dark
        if (__SELF.theme === 'dark') {
            a.style.color = '#39b9ff';
            
            // Ensure hover styles are applied to each item
            if (!items[i].hasHoverListeners) {
                items[i].addEventListener('mouseenter', function() {
                    a.style.color = '#ffffff';
                    this.style.backgroundColor = '#555';
                });
                
                items[i].addEventListener('mouseleave', function() {
                    a.style.color = '#39b9ff';
                    this.style.backgroundColor = '';
                });
                
                items[i].hasHoverListeners = true;
            }
        } else {
            a.style.color = '';
        }
    }
}

function toggle(component) {
    if (component.style.display == 'none') {
        component.style.display = '';
    } else {
        component.style.display = 'none';
    }
}

function create_following_alert() {
    let form = document.createElement('div');
    form.className = 'following-ui';
    form.id = 'following';
    form.style.display = 'none';
    
    if (__SELF.theme === 'dark') {
        form.classList.add('dark-theme');
    }

    let btn_stop_following = document.createElement('button');
    btn_stop_following.id = 'btn_stop_following';
    btn_stop_following.setAttribute('title', 'Parar de seguir a viatura');
    btn_stop_following.setAttribute('onclick', 'cancelar_seguir()');
    btn_stop_following.setAttribute('aria-label', 'Parar de seguir a viatura');

    let span = document.createElement('span');
    span.id = 'following_span';

    form.appendChild(btn_stop_following);
    form.appendChild(span);

    map.controls[google.maps.ControlPosition.RIGHT_TOP].push(form);
}

function checkform() {
    if (document.getElementById('address').value.length <= 2) {
        return false;
    }
    return true; // Explicit return for clarity
}
function _toggleTheme() {
    const currentTheme = __SELF.theme === 'dark' ? 'light' : 'dark';
    d("Toggling theme to: " + currentTheme, "orange");
    __SELF.theme = currentTheme;
    document.body.classList.toggle('dark-theme', currentTheme === 'dark');
    document.body.classList.toggle('light-theme', currentTheme === 'light');    
    updateMapTheme(currentTheme);
    applyTheme();
}




