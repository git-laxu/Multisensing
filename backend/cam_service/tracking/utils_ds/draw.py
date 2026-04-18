import numpy as np
import cv2
from enum import Enum

# 喝水drinking water，
# 搓手rubbing hands together，
# 单手抱脖one hand around neck，
# 裹紧衣服wrapping clothes，
# 穿衣服getting dressed
class Actions(Enum):
    noaction = 0
    drinkingwater = 1
    fastenthebutton=2
    foldedarm = 3
    gettingdressed=4
    handsaroundneck=6
    holdingheater = 5
#     onehandaroundneck = 6
    puttingonahat = 7
    rubbinghandstogether=8
    shouldershaking = 9
    wrappingclothes = 10
#     wrappingcollar = 10
#     zippingclothes = 10
    
    
#     label2action={'noaction': 0,
#               'drinking water':1,
#              'fasten the button':2,
#              'folded arm':3,
#              'getting dressed':4,
#              'hands around neck': 6,
#              'holding heater':5,
#              'one hand around neck':6,
#              'putting on a hat':7,
#              'rubbing hands together':8,
#              'shoulder shaking':9,
#              'wrapping clothes':10,
#              'wrapping collar':10,
#              'zipping clothes':10
#   }

    
#     label2action={'noaction': 0, 'drinking water':1,
#  'fasten the button':2,
#  'folded arm':3,
#  'getting dressed':4,
#  'hands around neck':5,
#  'holding heater':6,
#  'one hand around neck':7,
#  'putting on a hat':8,
#  'rubbing hands together':9,
#  'shoulder shaking':10,
#  'wrapping clothes':11,
#  'wrapping collar':12,
#  'zipping clothes':13}
# class Actions(Enum):
#     NoAction = 0
#     DrinkingWater = 1
#     fastenthebutton = 2
#     foldedarm = 3
#     handsaroundneck = 4
#     handsaroundneck = 5
#     holdingheater = 6
#     onehandaroundneck = 7
#     wrappingcollar = 8
#     fastenthebutton = 9
#     foldedarm = 10
#     shouldershaking = 11
#     puttingonahat = 12
#     handsaroundneck = 13
    
#     'noaction': 0, 'drinking water':1,
#  'fasten the button':2,
#  'folded arm':3,
#  'getting dressed':4,
#  'hands around neck':5,
#  'holding heater':6,
#  'one hand around neck':7,
#  'putting on a hat':8,
#  'rubbing hands together':9,
#  'shoulder shaking':10,
#  'wrapping clothes':11,
#  'wrapping collar':12,
#  'zipping clothes':13}
    
    
palette = (2 ** 11 - 1, 2 ** 15 - 1, 2 ** 20 - 1)


def compute_color_for_labels(label):
    """
    Simple function that adds fixed color depending on the class
    """
    color = [int((p * (label ** 2 - label + 1)) % 255) for p in palette]
    return tuple(color)


def draw_boxes(img, bbox, identities=None, actions = None, offset=(0,0)):
    for i,box in enumerate(bbox):
        x1,y1,x2,y2 = [int(i) for i in box]
        x1 += offset[0]
        x2 += offset[0]
        y1 += offset[1]
        y2 += offset[1]
        # box text and bar
        id = int(identities[i]) if identities is not None else 0   
         
        color = compute_color_for_labels(id)
        label = '{}{:d}'.format("", id)
        t_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_PLAIN, 2 , 2)[0]
        cv2.rectangle(img,(x1, y1),(x2,y2),color,3)
        cv2.rectangle(img,(x1, y1),(x1+t_size[0]+3,y1+t_size[1]+4), color,-1)
        cv2.putText(img,label,(x1,y1+t_size[1]+4), cv2.FONT_HERSHEY_PLAIN, 2, [255,255,255], 2)
        if actions[i] > -1:
            action_name = Actions(actions[i]).name
            cv2.putText(img,action_name,(x1,y1+t_size[1]+4), cv2.FONT_HERSHEY_PLAIN, 2, [255,255,255], 2)
           
    return img



if __name__ == '__main__':
    for i in range(82):
        print(compute_color_for_labels(i))
