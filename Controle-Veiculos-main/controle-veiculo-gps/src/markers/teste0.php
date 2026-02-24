<?php
	function display_image( &$image_dir ){
		header("Content-Type: image/png");
		header("Pragma: cache");
		header("Cache-Control: max-age=86400"); // um dia
		readfile($image_dir);
		exit;
	}
	
	$dir = dirname(__FILE__);
	$base = new ImagickDraw(); 
	
	$width = 28;
	$height = 34;
	
	$color = isset($_GET['c']) ? $_GET['c'] : "FFFFFF";
	$over_icon = isset($_GET['i']) ? $_GET['i'] : 'question';
	
	$already_done = $dir . '/cache/' . $over_icon . '_' . $color . '.png';
	if( file_exists($already_done)) {
		if( $debug ){
			echo "Arquivo '".$already_done."' ja existe.";
		}
		else{
			display_image($already_done);
			exit;
		}
	}
	
	/****************
	 * IMAGEM EM SI *
	 ****************/
	$base = new Imagick(); 
	$base->newImage( $width, $height, 'transparent' );
	$base->setImageFormat("png");

	/******************
	 * BASE DO MARKER * (quem realmente muda de cor)
	 ******************/
	$draw = new ImagickDraw(); 
	$draw->setStrokeWidth( round(($height/$width)*2) );
    $draw->setStrokeColor("#FFFFFF");
    $draw->setStrokeOpacity(0.4);
    $draw->setFillColor("#".$color);
	$draw->setStrokeAntialias(true);
	
	$control_y = -($height*0.33);
	$final_y = $height - (($height*5)/100); // altura - 10%
	
    $draw->pathStart();
	$draw->pathMoveToAbsolute($width/2, $final_y);
    $draw->pathCurveToAbsolute( -$width,
								$control_y,
								
								$width*2,
								$control_y,
								
								$width/2, // X do ponto que fecha o mapa
								$final_y ); // Y do ponto que fecha o mapa
    $draw->pathFinish();

	/********************
	 * FIGURA DO MARKER * (carro, celular, hospital, etc)
	 ********************/
	$over_icon_dir = $dir . '/over_icons';
	if( !file_exists( $over_icon_dir . '/' . $over_icon . '.png') ){
		$over_icon = "question";
	}
 
 	$image = new Imagick();
	$image->readImage($over_icon_dir . '/' . $over_icon . '.png');

	/********************
	 * SOMBRA DO MARKER *
	 ********************/
 	$shadow = new Imagick();
	$shadow->readImage($over_icon_dir . '/shadow.png');
	$base->compositeImage($shadow, Imagick::COMPOSITE_OVER, 0, ($height*60)/100);
	
	// junta as duas imagens
	$d = $image->getImageGeometry(); 
	$x = (($width - $d['width']) / 2)+1;
	$y = (($height - $d['height']) / 2)-4;
	
	$base->drawImage( $draw );
	$base->compositeImage($image, Imagick::COMPOSITE_DEFAULT, $x, $y);	
	$base->flattenImages();

	$output = $dir . '/cache/' . $over_icon . '_' . $color . '.png';
	$base->writeImage($output);
	
	display_image($output);
	
	$draw->destroy();
	$image->destroy();
	$imagick->destroy();
 ?>