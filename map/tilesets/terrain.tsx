<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.12.2" name="terrain" tilewidth="64" tileheight="52" tilecount="48" columns="4">
 <image source="../../public/assets/tilesets/terrain.png" width="256" height="624"/>
 <tile id="0" type="Dirt">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainId" value="dirt"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="1" type="Dirt">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainId" value="dirt"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="2" type="Dirt">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainId" value="dirt"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="3" type="Dirt">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainId" value="dirt"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="4" type="Stone">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainId" value="stone"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="5" type="Stone">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainId" value="stone"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="6" type="Stone">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainId" value="stone"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="7" type="Stone">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainId" value="stone"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="8" type="Water">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainId" value="water"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="9" type="Water">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainId" value="water"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="10" type="Water">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainId" value="water"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="11" type="Water">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainId" value="water"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="12" type="Grass">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainId" value="grass"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="13" type="Grass">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainId" value="grass"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="14" type="Grass">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainId" value="grass"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="15" type="Grass">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainId" value="grass"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="16" type="DirtGrassTransition">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainCorners" value="grass,dirt,dirt,dirt"/>
   <property name="terrainId" value="dirt"/>
   <property name="transitionPair" value="dirt-grass"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="17" type="DirtGrassTransition">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainCorners" value="grass,grass,dirt,dirt"/>
   <property name="terrainId" value="grass"/>
   <property name="transitionPair" value="dirt-grass"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="18" type="DirtGrassTransition">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainCorners" value="dirt,grass,grass,dirt"/>
   <property name="terrainId" value="grass"/>
   <property name="transitionPair" value="dirt-grass"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="19" type="DirtGrassTransition">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainCorners" value="grass,grass,grass,dirt"/>
   <property name="terrainId" value="grass"/>
   <property name="transitionPair" value="dirt-grass"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="20" type="DirtGrassTransition">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainCorners" value="grass,dirt,grass,dirt"/>
   <property name="terrainId" value="dirt"/>
   <property name="transitionPair" value="dirt-grass"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="21" type="DirtStoneTransition">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainCorners" value="stone,dirt,dirt,dirt"/>
   <property name="terrainId" value="dirt"/>
   <property name="transitionPair" value="dirt-stone"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="22" type="DirtStoneTransition">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainCorners" value="stone,stone,dirt,dirt"/>
   <property name="terrainId" value="stone"/>
   <property name="transitionPair" value="dirt-stone"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="23" type="DirtStoneTransition">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainCorners" value="dirt,stone,stone,dirt"/>
   <property name="terrainId" value="stone"/>
   <property name="transitionPair" value="dirt-stone"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="24" type="DirtStoneTransition">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainCorners" value="stone,stone,stone,dirt"/>
   <property name="terrainId" value="stone"/>
   <property name="transitionPair" value="dirt-stone"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="25" type="DirtStoneTransition">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainCorners" value="stone,dirt,stone,dirt"/>
   <property name="terrainId" value="dirt"/>
   <property name="transitionPair" value="dirt-stone"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="26" type="DirtWaterTransition">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainCorners" value="water,dirt,dirt,dirt"/>
   <property name="terrainId" value="water"/>
   <property name="transitionPair" value="dirt-water"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="27" type="DirtWaterTransition">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainCorners" value="water,water,dirt,dirt"/>
   <property name="terrainId" value="water"/>
   <property name="transitionPair" value="dirt-water"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="28" type="DirtWaterTransition">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainCorners" value="dirt,water,water,dirt"/>
   <property name="terrainId" value="water"/>
   <property name="transitionPair" value="dirt-water"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="29" type="DirtWaterTransition">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainCorners" value="water,water,water,dirt"/>
   <property name="terrainId" value="water"/>
   <property name="transitionPair" value="dirt-water"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="30" type="DirtWaterTransition">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainCorners" value="water,dirt,water,dirt"/>
   <property name="terrainId" value="water"/>
   <property name="transitionPair" value="dirt-water"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="31" type="StoneGrassTransition">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainCorners" value="grass,stone,stone,stone"/>
   <property name="terrainId" value="stone"/>
   <property name="transitionPair" value="stone-grass"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="32" type="StoneGrassTransition">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainCorners" value="grass,grass,stone,stone"/>
   <property name="terrainId" value="grass"/>
   <property name="transitionPair" value="stone-grass"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="33" type="StoneGrassTransition">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainCorners" value="stone,grass,grass,stone"/>
   <property name="terrainId" value="grass"/>
   <property name="transitionPair" value="stone-grass"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="34" type="StoneGrassTransition">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainCorners" value="grass,grass,grass,stone"/>
   <property name="terrainId" value="grass"/>
   <property name="transitionPair" value="stone-grass"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="35" type="StoneGrassTransition">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainCorners" value="grass,stone,grass,stone"/>
   <property name="terrainId" value="stone"/>
   <property name="transitionPair" value="stone-grass"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="36" type="StoneWaterTransition">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainCorners" value="water,stone,stone,stone"/>
   <property name="terrainId" value="water"/>
   <property name="transitionPair" value="stone-water"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="37" type="StoneWaterTransition">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainCorners" value="water,water,stone,stone"/>
   <property name="terrainId" value="water"/>
   <property name="transitionPair" value="stone-water"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="38" type="StoneWaterTransition">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainCorners" value="stone,water,water,stone"/>
   <property name="terrainId" value="water"/>
   <property name="transitionPair" value="stone-water"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="39" type="StoneWaterTransition">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainCorners" value="water,water,water,stone"/>
   <property name="terrainId" value="water"/>
   <property name="transitionPair" value="stone-water"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="40" type="StoneWaterTransition">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainCorners" value="water,stone,water,stone"/>
   <property name="terrainId" value="water"/>
   <property name="transitionPair" value="stone-water"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="41" type="WaterGrassTransition">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainCorners" value="grass,water,water,water"/>
   <property name="terrainId" value="water"/>
   <property name="transitionPair" value="water-grass"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="42" type="WaterGrassTransition">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainCorners" value="grass,grass,water,water"/>
   <property name="terrainId" value="water"/>
   <property name="transitionPair" value="water-grass"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="43" type="WaterGrassTransition">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainCorners" value="water,grass,grass,water"/>
   <property name="terrainId" value="water"/>
   <property name="transitionPair" value="water-grass"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="44" type="WaterGrassTransition">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainCorners" value="grass,grass,grass,water"/>
   <property name="terrainId" value="water"/>
   <property name="transitionPair" value="water-grass"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="45" type="WaterGrassTransition">
  <properties>
   <property name="buildable" type="bool" value="false"/>
   <property name="terrainCorners" value="grass,water,grass,water"/>
   <property name="terrainId" value="water"/>
   <property name="transitionPair" value="water-grass"/>
   <property name="walkable" type="bool" value="false"/>
  </properties>
 </tile>
 <tile id="46" type="Dirt">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainId" value="dirt"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="47" type="Dirt">
  <properties>
   <property name="buildable" type="bool" value="true"/>
   <property name="terrainId" value="dirt"/>
   <property name="walkable" type="bool" value="true"/>
  </properties>
 </tile>
 <wangsets>
  <wangset name="World Terrain" type="corner" tile="12">
   <wangcolor name="Dirt" color="#977142" tile="0" probability="1"/>
   <wangcolor name="Stone" color="#7d868b" tile="4" probability="1"/>
   <wangcolor name="Water" color="#167d8d" tile="8" probability="1"/>
   <wangcolor name="Grass" color="#708e30" tile="12" probability="1"/>
   <wangtile tileid="0" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="1" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="2" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="3" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="4" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="5" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="6" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="7" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="8" wangid="0,3,0,3,0,3,0,3"/>
   <wangtile tileid="9" wangid="0,3,0,3,0,3,0,3"/>
   <wangtile tileid="10" wangid="0,3,0,3,0,3,0,3"/>
   <wangtile tileid="11" wangid="0,3,0,3,0,3,0,3"/>
   <wangtile tileid="12" wangid="0,4,0,4,0,4,0,4"/>
   <wangtile tileid="13" wangid="0,4,0,4,0,4,0,4"/>
   <wangtile tileid="14" wangid="0,4,0,4,0,4,0,4"/>
   <wangtile tileid="15" wangid="0,4,0,4,0,4,0,4"/>
   <wangtile tileid="16" wangid="0,1,0,1,0,1,0,4"/>
   <wangtile tileid="17" wangid="0,4,0,1,0,1,0,4"/>
   <wangtile tileid="18" wangid="0,4,0,4,0,1,0,1"/>
   <wangtile tileid="19" wangid="0,4,0,4,0,1,0,4"/>
   <wangtile tileid="20" wangid="0,1,0,4,0,1,0,4"/>
   <wangtile tileid="21" wangid="0,1,0,1,0,1,0,2"/>
   <wangtile tileid="22" wangid="0,2,0,1,0,1,0,2"/>
   <wangtile tileid="23" wangid="0,2,0,2,0,1,0,1"/>
   <wangtile tileid="24" wangid="0,2,0,2,0,1,0,2"/>
   <wangtile tileid="25" wangid="0,1,0,2,0,1,0,2"/>
   <wangtile tileid="26" wangid="0,1,0,1,0,1,0,3"/>
   <wangtile tileid="27" wangid="0,3,0,1,0,1,0,3"/>
   <wangtile tileid="28" wangid="0,3,0,3,0,1,0,1"/>
   <wangtile tileid="29" wangid="0,3,0,3,0,1,0,3"/>
   <wangtile tileid="30" wangid="0,1,0,3,0,1,0,3"/>
   <wangtile tileid="31" wangid="0,2,0,2,0,2,0,4"/>
   <wangtile tileid="32" wangid="0,4,0,2,0,2,0,4"/>
   <wangtile tileid="33" wangid="0,4,0,4,0,2,0,2"/>
   <wangtile tileid="34" wangid="0,4,0,4,0,2,0,4"/>
   <wangtile tileid="35" wangid="0,2,0,4,0,2,0,4"/>
   <wangtile tileid="36" wangid="0,2,0,2,0,2,0,3"/>
   <wangtile tileid="37" wangid="0,3,0,2,0,2,0,3"/>
   <wangtile tileid="38" wangid="0,3,0,3,0,2,0,2"/>
   <wangtile tileid="39" wangid="0,3,0,3,0,2,0,3"/>
   <wangtile tileid="40" wangid="0,2,0,3,0,2,0,3"/>
   <wangtile tileid="41" wangid="0,3,0,3,0,3,0,4"/>
   <wangtile tileid="42" wangid="0,4,0,3,0,3,0,4"/>
   <wangtile tileid="43" wangid="0,4,0,4,0,3,0,3"/>
   <wangtile tileid="44" wangid="0,4,0,4,0,3,0,4"/>
   <wangtile tileid="45" wangid="0,3,0,4,0,3,0,4"/>
   <wangtile tileid="46" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="47" wangid="0,1,0,1,0,1,0,1"/>
  </wangset>
  <wangset name="Dirt / Grass" type="corner" tile="12">
   <wangcolor name="Dirt" color="#977142" tile="0" probability="1"/>
   <wangcolor name="Grass" color="#708e30" tile="12" probability="1"/>
   <wangtile tileid="0" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="1" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="2" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="3" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="12" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="13" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="14" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="15" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="16" wangid="0,1,0,1,0,1,0,2"/>
   <wangtile tileid="17" wangid="0,2,0,1,0,1,0,2"/>
   <wangtile tileid="18" wangid="0,2,0,2,0,1,0,1"/>
   <wangtile tileid="19" wangid="0,2,0,2,0,1,0,2"/>
   <wangtile tileid="20" wangid="0,1,0,2,0,1,0,2"/>
   <wangtile tileid="46" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="47" wangid="0,1,0,1,0,1,0,1"/>
  </wangset>
  <wangset name="Dirt / Stone" type="corner" tile="4">
   <wangcolor name="Dirt" color="#977142" tile="0" probability="1"/>
   <wangcolor name="Stone" color="#7d868b" tile="4" probability="1"/>
   <wangtile tileid="0" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="1" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="2" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="3" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="4" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="5" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="6" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="7" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="21" wangid="0,1,0,1,0,1,0,2"/>
   <wangtile tileid="22" wangid="0,2,0,1,0,1,0,2"/>
   <wangtile tileid="23" wangid="0,2,0,2,0,1,0,1"/>
   <wangtile tileid="24" wangid="0,2,0,2,0,1,0,2"/>
   <wangtile tileid="25" wangid="0,1,0,2,0,1,0,2"/>
   <wangtile tileid="46" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="47" wangid="0,1,0,1,0,1,0,1"/>
  </wangset>
  <wangset name="Dirt / Water" type="corner" tile="8">
   <wangcolor name="Dirt" color="#977142" tile="0" probability="1"/>
   <wangcolor name="Water" color="#167d8d" tile="8" probability="1"/>
   <wangtile tileid="0" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="1" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="2" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="3" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="8" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="9" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="10" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="11" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="26" wangid="0,1,0,1,0,1,0,2"/>
   <wangtile tileid="27" wangid="0,2,0,1,0,1,0,2"/>
   <wangtile tileid="28" wangid="0,2,0,2,0,1,0,1"/>
   <wangtile tileid="29" wangid="0,2,0,2,0,1,0,2"/>
   <wangtile tileid="30" wangid="0,1,0,2,0,1,0,2"/>
   <wangtile tileid="46" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="47" wangid="0,1,0,1,0,1,0,1"/>
  </wangset>
  <wangset name="Stone / Grass" type="corner" tile="12">
   <wangcolor name="Stone" color="#7d868b" tile="4" probability="1"/>
   <wangcolor name="Grass" color="#708e30" tile="12" probability="1"/>
   <wangtile tileid="4" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="5" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="6" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="7" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="12" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="13" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="14" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="15" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="31" wangid="0,1,0,1,0,1,0,2"/>
   <wangtile tileid="32" wangid="0,2,0,1,0,1,0,2"/>
   <wangtile tileid="33" wangid="0,2,0,2,0,1,0,1"/>
   <wangtile tileid="34" wangid="0,2,0,2,0,1,0,2"/>
   <wangtile tileid="35" wangid="0,1,0,2,0,1,0,2"/>
  </wangset>
  <wangset name="Stone / Water" type="corner" tile="8">
   <wangcolor name="Stone" color="#7d868b" tile="4" probability="1"/>
   <wangcolor name="Water" color="#167d8d" tile="8" probability="1"/>
   <wangtile tileid="4" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="5" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="6" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="7" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="8" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="9" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="10" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="11" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="36" wangid="0,1,0,1,0,1,0,2"/>
   <wangtile tileid="37" wangid="0,2,0,1,0,1,0,2"/>
   <wangtile tileid="38" wangid="0,2,0,2,0,1,0,1"/>
   <wangtile tileid="39" wangid="0,2,0,2,0,1,0,2"/>
   <wangtile tileid="40" wangid="0,1,0,2,0,1,0,2"/>
  </wangset>
  <wangset name="Water / Grass" type="corner" tile="12">
   <wangcolor name="Water" color="#167d8d" tile="8" probability="1"/>
   <wangcolor name="Grass" color="#708e30" tile="12" probability="1"/>
   <wangtile tileid="8" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="9" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="10" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="11" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="12" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="13" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="14" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="15" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="41" wangid="0,1,0,1,0,1,0,2"/>
   <wangtile tileid="42" wangid="0,2,0,1,0,1,0,2"/>
   <wangtile tileid="43" wangid="0,2,0,2,0,1,0,1"/>
   <wangtile tileid="44" wangid="0,2,0,2,0,1,0,2"/>
   <wangtile tileid="45" wangid="0,1,0,2,0,1,0,2"/>
  </wangset>
  <wangset name="Water / Grass" type="corner" tile="12">
   <wangcolor name="Water" color="#167d8d" tile="8" probability="1"/>
   <wangcolor name="Grass" color="#708e30" tile="12" probability="1"/>
   <wangtile tileid="8" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="9" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="10" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="11" wangid="0,1,0,1,0,1,0,1"/>
   <wangtile tileid="12" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="13" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="14" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="15" wangid="0,2,0,2,0,2,0,2"/>
   <wangtile tileid="41" wangid="0,1,0,1,0,1,0,2"/>
   <wangtile tileid="42" wangid="0,2,0,1,0,1,0,2"/>
   <wangtile tileid="43" wangid="0,2,0,2,0,1,0,1"/>
   <wangtile tileid="44" wangid="0,2,0,2,0,1,0,2"/>
   <wangtile tileid="45" wangid="0,1,0,2,0,1,0,2"/>
  </wangset>
 </wangsets>
</tileset>
