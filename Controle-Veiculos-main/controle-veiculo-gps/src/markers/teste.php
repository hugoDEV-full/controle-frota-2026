<?php
require($_SERVER['DOCUMENT_ROOT'].'/acl.php');

    
    function d($message, $priority = LOG_INFO) {
        syslog($priority, $message);
    }
    function error($message, $priority = LOG_ERR) {
        syslog($priority, $message);
    }
    function warning($message, $priority = LOG_WARNING) {
        syslog($priority, $message);
    }
    function info($message, $priority = LOG_INFO) {
        syslog($priority, $message);
    }

    $debug = isset($_GET['debug']) ? 1 : 0;
    if( $debug){
        error_reporting(E_ALL);
        ini_set('display_errors', 1);
        ini_set('display_startup_errors', 1);
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('Expires: 0');
    }else{
        header("Content-Type: image/png");
		header("Pragma: cache");
		header("Cache-Control: max-age=86400");
        openlog('samudf-marker', LOG_CONS | LOG_PID | LOG_NDELAY, LOG_LOCAL0);
        //info("Starting marker generation for icon: " . $_GET['i'] . " and color: " . $_GET['c']);
    }
    $dir = dirname(__FILE__);
    $width = 28;
    $height = 34;
    $color = isset($_GET['c']) ? $_GET['c'] : "FFFFFF";
    $over_icon = isset($_GET['i']) ? $_GET['i'] : 'question';
    $cache_dir = $dir . '/cache/';
    if(!is_dir($cache_dir)){
        if(!@mkdir($cache_dir, 0755, true)){
            die("<pre>Error: Unable to create cache directory $cache_dir. Please check permissions.</pre>");
        }
    }
    if(!is_writable($cache_dir)){
        die("<pre>Error: Cache directory is not writable $cache_dir. Please check permissions.</pre>");
    }
    $already_done = $cache_dir . $over_icon . '_' . $color . '.png';
	if( !$debug && file_exists($already_done)) {
		header('Content-Type: image/png');
		header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
		header('Pragma: no-cache');
		header('Expires: 0');
		readfile($already_done);
        exit;
	}
	if( !class_exists('ImagickDraw') ){
        die("<pre>Error: ImagickDraw class not found. Please check if Imagick is installed.</pre>");
    }
    $base = new ImagickDraw();
    $base = new Imagick();
    $base->newImage( $width, $height, 'transparent' );
    $base->setImageFormat("png");
    $draw = new ImagickDraw();
    $draw->setStrokeWidth( round(($height/$width)*2) );
    $draw->setStrokeColor("#FFFFFF");
    $draw->setStrokeOpacity(0.4);
    $draw->setFillColor("#".$color);
    $draw->setStrokeAntialias(true);
    $control_y = -($height*0.33);
    $final_y = $height - (($height*5)/100);
    $draw->pathStart();
    $draw->pathMoveToAbsolute($width/2, $final_y);
    $draw->pathCurveToAbsolute( -$width,
                                $control_y,
                                $width*2,
                                $control_y,
                                $width/2,
                                $final_y );
    $draw->pathFinish();
    $over_icon_dir = $dir . '/over_icons';
    if( !file_exists( $over_icon_dir . '/' . $over_icon . '.png') ){
        $over_icon = "question";
    }
    $image = new Imagick();
    $image->readImage($over_icon_dir . '/' . $over_icon . '.png');
    $shadow = new Imagick();
    $shadow->readImage($over_icon_dir . '/shadow.png');
    $base->compositeImage($shadow, Imagick::COMPOSITE_OVER, 0, ($height*60)/100);
    $d = $image->getImageGeometry();
    $x = (($width - $d['width']) / 2)+1;
    $y = (($height - $d['height']) / 2)-4;
    $base->drawImage( $draw );
    $base->compositeImage($image, Imagick::COMPOSITE_DEFAULT, $x, $y);
    $base->setImageBackgroundColor('white');
    $base->setImageAlphaChannel(11);
    $base->mergeImageLayers(Imagick::LAYERMETHOD_FLATTEN);
    $output = $dir . '/cache/' . $over_icon . '_' . $color . '.png';
    $base->writeImage($output);
    readfile($output);
    $draw->destroy();
    $image->destroy();
    $base->destroy();
    $shadow->destroy();
?>